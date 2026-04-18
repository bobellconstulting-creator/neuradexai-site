/**
 * Jarvis secret storage.
 *
 * On Vercel (process.env.VERCEL === '1'): reads from process.env, which Vercel
 * stores encrypted at rest and only decrypts at function runtime.
 *
 * On local Windows: reads from DPAPI-encrypted blobs at %LOCALAPPDATA%\Jarvis\secrets\<name>.dpapi.
 * DPAPI ties the encryption key to the current Windows user, so only Bo's logged-in
 * session on this machine can decrypt. Same cryptographic backing that Windows
 * Credential Manager and libraries like keytar use under the hood.
 *
 * Byte integrity: values are passed between Node and PowerShell as base64 over
 * environment variables. Raw stdin isn't safe for values with trailing newlines —
 * PowerShell's $input processes input line-by-line and drops the final \n.
 * Base64 preserves every byte exactly.
 *
 * In-memory cache avoids the PowerShell spawn cost (~200ms) after the first read.
 *
 * Forward-compatible: the exported interface (getSecret/setSecret) matches what a
 * keytar-backed implementation would look like. Phase 14 can swap the local backend
 * to @napi-rs/keyring without touching consumers.
 */

import { spawnSync } from 'child_process'
import { join } from 'path'
import { mkdirSync, existsSync, statSync } from 'fs'
import { homedir } from 'os'

const ON_VERCEL = process.env.VERCEL === '1'
const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
const SECRETS_DIR = join(LOCAL_APP_DATA, 'Jarvis', 'secrets')

// Allowlist for secret names. Prevents path injection (e.g. "../../etc/evil")
// if any caller ever passes a non-literal name. All secrets must be UPPER_SNAKE_CASE.
const SECRET_NAME_RE = /^[A-Z0-9_]+$/

const cache = new Map<string, string>()

function ensureSecretsDir(): void {
  if (!existsSync(SECRETS_DIR)) {
    mkdirSync(SECRETS_DIR, { recursive: true })
  }
}

function assertValidName(name: string): void {
  if (!SECRET_NAME_RE.test(name)) {
    throw new Error(`Invalid secret name: ${name.slice(0, 40)}`)
  }
}

function blobPath(name: string): string {
  return join(SECRETS_DIR, `${name}.dpapi`)
}

/**
 * Retrieves a secret by name.
 * Returns null if the secret is not found. Throws on unexpected errors.
 */
export async function getSecret(name: string): Promise<string | null> {
  assertValidName(name)
  if (cache.has(name)) return cache.get(name) ?? null

  if (ON_VERCEL) {
    const v = process.env[name] ?? null
    if (v) cache.set(name, v)
    return v
  }

  const path = blobPath(name)
  if (!existsSync(path)) return null

  // Guard against a zero-byte blob — PowerShell decrypt would throw with
  // a noisy stderr and bridge-auth would return 500. Better to flag clearly.
  if (statSync(path).size === 0) {
    throw new Error(`DPAPI blob for ${name} is empty — re-run scripts/bootstrap-secret.mjs`)
  }

  // Decrypt via PowerShell. Emit the plaintext as base64 so bytes survive
  // the node <-> PowerShell stdout boundary (console newline handling, encoding).
  const script = `
    $ErrorActionPreference = 'Stop'
    $encrypted = Get-Content -Raw -LiteralPath '${path.replace(/'/g, "''")}'
    $secure = ConvertTo-SecureString $encrypted
    $plain = [System.Net.NetworkCredential]::new("", $secure).Password
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
    [System.Console]::Out.Write([Convert]::ToBase64String($bytes))
  `.trim()

  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  })

  if (result.status !== 0) {
    throw new Error(`getSecret(${name}) failed: ${(result.stderr ?? '').trim() || 'unknown'}`)
  }

  const b64 = (result.stdout ?? '').trim()
  if (!b64) return null
  const value = Buffer.from(b64, 'base64').toString('utf8')
  cache.set(name, value)
  return value
}

/**
 * Stores a secret under the given name (local only — Vercel secrets are set via Vercel CLI/UI).
 * Overwrites any existing value for that name.
 */
export async function setSecret(name: string, value: string): Promise<void> {
  assertValidName(name)
  if (ON_VERCEL) {
    throw new Error('setSecret is not supported on Vercel. Set Vercel env vars via the Vercel CLI or dashboard.')
  }
  ensureSecretsDir()
  const path = blobPath(name)

  // Pass the value via env var as base64 to preserve every byte exactly.
  // PowerShell reads $env:DPAPI_VALUE_B64, decodes, encrypts with DPAPI, writes.
  const valueB64 = Buffer.from(value, 'utf8').toString('base64')

  const script = `
    $ErrorActionPreference = 'Stop'
    $plain = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DPAPI_VALUE_B64))
    $secure = ConvertTo-SecureString $plain -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secure
    [System.IO.File]::WriteAllText('${path.replace(/'/g, "''")}', $encrypted)
  `.trim()

  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, DPAPI_VALUE_B64: valueB64 },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  })

  if (result.status !== 0) {
    throw new Error(`setSecret(${name}) failed: ${(result.stderr ?? '').trim() || 'unknown'}`)
  }
  cache.set(name, value)
}

/** Clears the in-memory cache. Useful after rotating a secret. */
export function clearSecretCache(): void {
  cache.clear()
}
