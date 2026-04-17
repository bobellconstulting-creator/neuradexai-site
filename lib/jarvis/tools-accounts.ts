/**
 * tools-accounts.ts — Jarvis account creation orchestrator.
 *
 * Runs the appropriate Playwright script on Bo's local machine via the
 * local bridge, parses the JSON output, and auto-stores credentials in
 * the Vault. Returns a structured result for Jarvis to report over Telegram.
 *
 * Supported services: printify | etsy | gumroad | pinterest
 *
 * Security invariants:
 *   - Passwords are stored in Vault only — never logged.
 *   - Pinterest is flagged as manual-step-required (no script yet).
 *   - dryRun=true passes --dry-run to the script for safe testing.
 */
import { z } from 'zod'
import type { ToolResult } from './tools'
import { storeCredential } from './tools-vault'

// ─── Constants ────────────────────────────────────────────────────────────────

const SOCIAL_DIR = 'C:/Users/bobel/social'

const SCRIPTS: Record<string, string> = {
  printify: `${SOCIAL_DIR}/create_printify_account.mjs`,
  etsy: `${SOCIAL_DIR}/create_etsy_account.mjs`,
  gumroad: `${SOCIAL_DIR}/create_gumroad_account.mjs`,
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

export const createMeritAccountSchema = z.object({
  service: z.enum(['printify', 'etsy', 'gumroad', 'pinterest']),
  dryRun: z.boolean().optional().default(false),
})
export type CreateMeritAccountArgs = z.infer<typeof createMeritAccountSchema>

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface CreateMeritAccountResult {
  service: string
  status: 'created' | 'already-exists' | 'manual-step-required'
  credentials?: Record<string, string>
  note?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(ok: boolean, detail: string): string {
  return `[${now()}] createMeritAccount ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

/**
 * Run the account-creation script via the local bridge.
 * Returns the parsed JSON payload the script writes to stdout.
 */
async function runScriptViaBridge(
  scriptPath: string,
  dryRun: boolean,
  bridgeUrl: string,
  secret: string,
  timeoutSec: number
): Promise<{ ok: boolean; payload?: Record<string, string>; stderr?: string; error?: string }> {
  const dryFlag = dryRun ? ' --dry-run' : ''
  const cmd = `node "${scriptPath}"${dryFlag}`

  let res: Response
  try {
    res = await fetch(`${bridgeUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ cmd, timeout: timeoutSec }),
      signal: AbortSignal.timeout((timeoutSec * 1000) + 5_000),
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (!res.ok) {
    return { ok: false, error: `bridge HTTP ${res.status}` }
  }

  const data = (await res.json()) as { exitCode: number; stdout: string; stderr: string }

  if (data.exitCode !== 0) {
    return {
      ok: false,
      stderr: data.stderr,
      error: `script exited ${data.exitCode}: ${data.stderr?.slice(0, 300) ?? ''}`,
    }
  }

  // Script writes a single JSON line to stdout on success.
  const lastLine = (data.stdout ?? '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .pop() ?? ''

  try {
    const payload = JSON.parse(lastLine) as Record<string, string>
    return { ok: true, payload, stderr: data.stderr }
  } catch {
    return {
      ok: false,
      stderr: data.stderr,
      error: `Could not parse script JSON output: ${lastLine.slice(0, 200)}`,
    }
  }
}

// ─── Main tool ────────────────────────────────────────────────────────────────

export async function createMeritAccount(
  raw: unknown
): Promise<ToolResult<CreateMeritAccountResult>> {
  const parsed = createMeritAccountSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt(false, 'invalid args: ' + parsed.error.message)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { service, dryRun } = parsed.data

  // ── Pinterest: no script yet — manual step ────────────────────────────────
  if (service === 'pinterest') {
    const note =
      'Pinterest account creation requires manual setup. ' +
      'Go to pinterest.com/join, sign up with bobellconstulting@gmail.com, ' +
      'then run storeCredential to save the credentials in Vault.'
    const r = mkReceipt(false, `pinterest manual-step-required`)
    return {
      ok: false,
      result: {
        service: 'pinterest',
        status: 'manual-step-required',
        note,
      },
      error: note,
      receipt: r,
    }
  }

  // ── Check bridge config ───────────────────────────────────────────────────
  const bridgeUrl = process.env.LOCAL_BRIDGE_URL
  const secret = process.env.LOCAL_BRIDGE_SECRET
  if (!bridgeUrl || !secret) {
    const msg =
      'BLOCKED: LOCAL_BRIDGE_URL or LOCAL_BRIDGE_SECRET not configured. ' +
      'Bridge server must be running locally. Cannot run Playwright scripts on Vercel.'
    const r = mkReceipt(false, msg)
    return { ok: false, error: msg, receipt: r }
  }

  const scriptPath = SCRIPTS[service]
  // Playwright account creation can be slow — allow 2 minutes
  const timeoutSec = 120

  const run = await runScriptViaBridge(scriptPath, dryRun ?? false, bridgeUrl, secret, timeoutSec)

  if (!run.ok || !run.payload) {
    const errMsg = run.error ?? 'script failed'
    const r = mkReceipt(false, `service=${service} ${errMsg}`)
    return {
      ok: false,
      result: { service, status: 'manual-step-required', note: errMsg },
      error: errMsg,
      receipt: r,
    }
  }

  const payload = run.payload

  // ── Auto-store credentials in Vault ──────────────────────────────────────
  // Map payload fields to vault schema: { service, username, password, url?, notes? }
  const vaultUsername = payload.email ?? payload.shopName ?? service
  const vaultPassword = payload.password ?? ''
  const vaultUrl =
    payload.shopUrl ?? payload.profileUrl ?? payload.shopId
      ? `https://printify.com/app/shop/${payload.shopId}`
      : undefined
  const vaultNotes = payload.note

  if (vaultPassword && !dryRun) {
    await storeCredential({
      service,
      username: vaultUsername,
      password: vaultPassword,
      ...(vaultUrl !== undefined ? { url: vaultUrl } : {}),
      ...(vaultNotes !== undefined ? { notes: vaultNotes } : {}),
    })
  }

  // Build safe credentials object for the result (omit password from result payload).
  const safeCredentials: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (k !== 'password') safeCredentials[k] = v
  }
  if (dryRun) safeCredentials['dryRun'] = 'true'

  const r = mkReceipt(
    true,
    `service=${service} user=${vaultUsername} dryRun=${dryRun ?? false} vaultStored=${!dryRun && !!vaultPassword}`
  )

  return {
    ok: true,
    result: {
      service,
      status: 'created',
      credentials: safeCredentials,
      note:
        payload.note ??
        (run.stderr ? `Script warnings: ${run.stderr.slice(0, 200)}` : undefined),
    },
    receipt: r,
  }
}
