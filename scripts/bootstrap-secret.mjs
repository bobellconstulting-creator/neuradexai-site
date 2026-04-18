#!/usr/bin/env node
/**
 * One-time secret migration: Vercel env → DPAPI blob on disk.
 *
 * Usage:
 *   node scripts/bootstrap-secret.mjs JARVIS_BRIDGE_SECRET
 *
 * Reads the value from the current Vercel project's production env via `vercel env pull`,
 * writes to %LOCALAPPDATA%\Jarvis\secrets\<name>.dpapi, then deletes the pull file.
 *
 * Safe to re-run — will overwrite the stored value with the latest from Vercel.
 * This is the primitive Phase 14 will use for every other secret (Gmail OAuth, GitHub PAT, etc.)
 */

import { spawnSync } from 'child_process'
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const [, , secretName] = process.argv
if (!secretName) {
  console.error('usage: node scripts/bootstrap-secret.mjs <SECRET_NAME>')
  process.exit(1)
}

const PULL_FILE = `.env.bootstrap-${secretName}`
const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
const SECRETS_DIR = join(LOCAL_APP_DATA, 'Jarvis', 'secrets')
const BLOB_PATH = join(SECRETS_DIR, `${secretName}.dpapi`)

function cleanup() {
  if (existsSync(PULL_FILE)) {
    try { unlinkSync(PULL_FILE) } catch {}
  }
}

process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
// SIGTERM handler — PM2 stop or Task Manager kill would otherwise leave
// the plaintext .env.bootstrap-* file on disk if the script was mid-run.
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

// 1. Pull production env from Vercel.
console.log(`[bootstrap] pulling ${secretName} from Vercel production env...`)
const pull = spawnSync('vercel', ['env', 'pull', PULL_FILE, '--environment=production', '--yes'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
})
if (pull.status !== 0) {
  console.error(`[bootstrap] vercel env pull failed: ${pull.stderr || pull.stdout}`)
  process.exit(1)
}
if (!existsSync(PULL_FILE)) {
  console.error(`[bootstrap] pull file not created`)
  process.exit(1)
}

// 2. Extract the secret value.
// Parse .env format correctly: values may be quoted, and quoted values have
// standard backslash-escapes (\n → newline, \r → CR, \\ → \, \" → "). If we don't
// unescape, a secret ending in a real newline becomes one ending in literal "\n".
const env = readFileSync(PULL_FILE, 'utf8')

function parseEnvLine(line, name) {
  if (!line.startsWith(`${name}=`)) return null
  const raw = line.slice(name.length + 1)
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    // Quoted: unescape standard sequences
    return raw
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  // Unquoted: value is taken literally up to end of line
  return raw
}

const line = env.split(/\r?\n/).find((l) => l.startsWith(`${secretName}=`))
const value = line ? parseEnvLine(line, secretName) : null
if (!value) {
  console.error(`[bootstrap] ${secretName} not found in Vercel production env`)
  cleanup()
  process.exit(1)
}
console.log(`[bootstrap] got value (${value.length} chars, sha256[0:16]=${(await import('crypto')).createHash('sha256').update(value).digest('hex').slice(0, 16)})`)

// 3. Delete the plaintext file immediately.
cleanup()

// 4. Write DPAPI blob via PowerShell. Value is passed as base64 via env var —
// preserves every byte exactly (stdin mangles trailing newlines, command line leaks via ps).
if (!existsSync(SECRETS_DIR)) {
  mkdirSync(SECRETS_DIR, { recursive: true })
}

const valueB64 = Buffer.from(value, 'utf8').toString('base64')

const script = `
  $ErrorActionPreference = 'Stop'
  $plain = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DPAPI_VALUE_B64))
  $secure = ConvertTo-SecureString $plain -AsPlainText -Force
  $encrypted = ConvertFrom-SecureString $secure
  [System.IO.File]::WriteAllText('${BLOB_PATH.replace(/'/g, "''")}', $encrypted)
`.trim()

const store = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  env: { ...process.env, DPAPI_VALUE_B64: valueB64 },
  encoding: 'utf8',
  windowsHide: true,
  timeout: 10_000,
})

if (store.status !== 0) {
  console.error(`[bootstrap] DPAPI write failed: ${(store.stderr ?? '').trim()}`)
  process.exit(1)
}

console.log(`[bootstrap] OK — ${secretName} stored at ${BLOB_PATH}`)
console.log(`[bootstrap] next: restart the Node process so secrets.ts picks it up on first getSecret call`)
