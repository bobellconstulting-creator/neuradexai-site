/**
 * Jarvis omnicompetent tool belt.
 *
 * Wraps the scripts at C:/Users/bobel/social/ plus new browser-automation
 * tools (browserLogin, createAccount) behind a typed, Zod-validated registry.
 *
 * Each tool returns { ok, result?, error?, receipt }. The receipt is a
 * one-line audit string appended to jarvis-tool-log.md in COG.
 *
 * Side-effects & invariants:
 *   - Uses the shared playwright profile at C:/Users/bobel/social/linda-profile/
 *     (Bo logged in manually — NEVER delete or reset).
 *   - New account credentials are APPENDED (never overwritten) to
 *     C:/Users/bobel/.secrets/jarvis-accounts.env.
 *   - CAPTCHA / 2FA is NEVER auto-solved: the tool pauses and pings Bo over
 *     Telegram, then waits for a resume signal.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { getUpcomingEvents, type CalendarEvent } from '@/lib/google/calendar'
import {
  createFolder,
  writeDoc,
  createFolderSchema,
  writeDocSchema,
  syncCalendarToVault,
  syncCalendarToVaultSchema,
  calculateEarnings,
  calculateEarningsSchema,
} from './tools-fs'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  deleteCalendarEventSchema,
} from './tools-calendar'

export {
  createFolder,
  writeDoc,
  createFolderSchema,
  writeDocSchema,
  syncCalendarToVault,
  syncCalendarToVaultSchema,
  calculateEarnings,
  calculateEarningsSchema,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  deleteCalendarEventSchema,
}

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const SOCIAL_DIR = 'C:/Users/bobel/social'
const SCRIPT_POST_X = path.join(SOCIAL_DIR, 'post_x.mjs')
const SCRIPT_POST_TIKTOK = path.join(SOCIAL_DIR, 'post_tiktok.mjs')
const SCRIPT_GEN_IMAGE = path.join(SOCIAL_DIR, 'gen_image.mjs')
const USER_DATA_DIR = path.join(SOCIAL_DIR, 'linda-profile')
const OUT_DIR = path.join(SOCIAL_DIR, 'out')
const ACCOUNTS_FILE = 'C:/Users/bobel/.secrets/jarvis-accounts.env'
const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'
const DEFAULT_SPAWN_TIMEOUT_MS = 120_000

// ──────────────────────────────────────────────────────────────────────────
// Piper TTS — local, free, Paul-Bettany-ish British male "JARVIS" voice.
//
// Voice swap mechanism:
//   1. Drop <name>.onnx + <name>.onnx.json into PIPER_VOICES_DIR
//   2. Add an entry to PIPER_VOICES mapping an alias -> filename
//   3. Add the alias to speakVoiceEnum below (keeps Zod + manifest honest)
//
// Upgrade path to ElevenLabs (paid — requires Bo's opt-in +
// ENABLE_PAID_FALLBACK=1 per session):
//   - store ELEVENLABS_API_KEY in env
//   - swap the Piper spawn() for a fetch() to
//     https://api.elevenlabs.io/v1/text-to-speech/<voice_id>
//     (the "British butler" / "Paul" voice id) writing the mp3 stream
//     to outPath; keep the Telegram send + receipt logic identical.
// ──────────────────────────────────────────────────────────────────────────

const PIPER_ROOT = 'C:/Users/bobel/tools/piper'
const PIPER_EXE = path.join(PIPER_ROOT, 'piper', 'piper.exe')
const PIPER_VOICES_DIR = path.join(PIPER_ROOT, 'voices')
const SPEECH_OUT_DIR = 'C:/Users/bobel/tmp/jarvis-speech'
const TELEGRAM_DEFAULT_CHAT_ID = '7240677590'

const PIPER_VOICES: Record<string, string> = {
  alan: 'en_GB-alan-medium.onnx',
}

// ──────────────────────────────────────────────────────────────────────────
// Whisper STT — local, free, faster-whisper (CTranslate2 backend).
//
// Models cached under WHISPER_DIR/models. base.en (~140MB) is the default —
// good balance of speed + accuracy on a CPU laptop. Upgrade alias to
// "small.en" or "medium.en" by changing WHISPER_DEFAULT_MODEL (auto-downloads).
//
// Free-first contract: never wires Whisper API / Azure / AWS Transcribe.
// ──────────────────────────────────────────────────────────────────────────

const WHISPER_DIR = 'C:/Users/bobel/tools/whisper'
const WHISPER_SCRIPT = path.join(WHISPER_DIR, 'transcribe.py')
const WHISPER_MODEL_DIR = path.join(WHISPER_DIR, 'models')
const WHISPER_DEFAULT_MODEL = process.env.WHISPER_MODEL || 'base.en'
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'py' : 'python3')

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface ToolResult<T = unknown> {
  ok: boolean
  result?: T
  error?: string
  receipt: string
}

export interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function truncate(s: string, max = 4_000): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n…[truncated ${s.length - max} chars]`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error: ' + String(error)
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Log sink should never break the tool — swallow silently here; callers
    // still get the receipt in their response payload.
  }
}

async function runChild(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<SpawnResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      shell: false,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }, timeoutMs)

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', (err) => {
      stderr += '\nSPAWN_ERROR: ' + getErrorMessage(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        code,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        timedOut,
      })
    })
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────────────────────────

export const postToXSchema = z.object({
  text: z.string().min(1).max(280),
  imagePath: z.string().optional(),
  dryRun: z.boolean().optional(),
})
export type PostToXArgs = z.infer<typeof postToXSchema>

export const postToTikTokSchema = z.object({
  videoPath: z.string().min(1),
  caption: z.string().min(1).max(2_200),
  dryRun: z.boolean().optional(),
})
export type PostToTikTokArgs = z.infer<typeof postToTikTokSchema>

export const generateImageSchema = z.object({
  prompt: z.string().min(1),
  outPath: z.string().optional(),
  provider: z.enum(['auto', 'nvidia', 'gemini', 'local']).optional(),
  force: z.boolean().optional(),
})
export type GenerateImageArgs = z.infer<typeof generateImageSchema>

export const shellExecSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
})
export type ShellExecArgs = z.infer<typeof shellExecSchema>

export const browserLoginSchema = z.object({
  url: z.string().url(),
  usernameSelector: z.string().min(1),
  passwordSelector: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  submitSelector: z.string().optional(),
  saveProfile: z.boolean().optional(),
  twoFactorHook: z.boolean().optional(),
  telegramChatId: z.string().optional(),
})
export type BrowserLoginArgs = z.infer<typeof browserLoginSchema>

export const speakVoiceEnum = z.enum(['alan'])
export type SpeakVoice = z.infer<typeof speakVoiceEnum>

export const listenSchema = z.object({
  audioPath: z.string().min(1),
  language: z.string().min(2).max(8).optional(),
  model: z.string().min(1).optional(),
})
export type ListenArgs = z.infer<typeof listenSchema>

export const speakSchema = z.object({
  text: z.string().min(1).max(4_000),
  outPath: z.string().optional(),
  voice: speakVoiceEnum.optional().default('alan'),
  sendToTelegram: z.boolean().optional().default(false),
  telegramChatId: z.string().optional(),
})
export type SpeakArgs = z.infer<typeof speakSchema>

export const getCalendarSchema = z.object({
  days: z.number().int().positive().max(90).optional(),
})
export type GetCalendarArgs = z.infer<typeof getCalendarSchema>

export const createAccountSchema = z.object({
  service: z.enum(['x', 'tiktok', 'generic']),
  email: z.string().email(),
  username: z.string().min(1),
  password: z.string().min(6),
  signupUrl: z.string().url().optional(),
  fieldSelectors: z
    .object({
      email: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      submit: z.string().optional(),
    })
    .optional(),
  telegramChatId: z.string().optional(),
})
export type CreateAccountArgs = z.infer<typeof createAccountSchema>

// ──────────────────────────────────────────────────────────────────────────
// Tool implementations
// ──────────────────────────────────────────────────────────────────────────

function mkReceipt(tool: string, ok: boolean, detail: string): string {
  return `[${now()}] ${tool} ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

export async function postToX(raw: unknown): Promise<ToolResult<SpawnResult>> {
  const parsed = postToXSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('postToX', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { text, imagePath, dryRun } = parsed.data
  const args = [SCRIPT_POST_X, text]
  if (imagePath) args.push(imagePath)
  if (dryRun) args.push('--dry-run')
  const res = await runChild('node', args, { cwd: SOCIAL_DIR })
  const ok = res.code === 0 && !res.timedOut
  const r = mkReceipt(
    'postToX',
    ok,
    `dryRun=${!!dryRun} code=${res.code} ${dryRun ? text.slice(0, 40) : `posted ${text.slice(0, 40)}`}`
  )
  await appendReceipt(r)
  return ok
    ? { ok, result: res, receipt: r }
    : { ok, result: res, error: res.stderr || `exit ${res.code}`, receipt: r }
}

export async function postToTikTok(raw: unknown): Promise<ToolResult<SpawnResult>> {
  const parsed = postToTikTokSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('postToTikTok', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { videoPath, caption, dryRun } = parsed.data
  const args = [SCRIPT_POST_TIKTOK, caption, videoPath]
  if (dryRun) args.push('--dry-run')
  const res = await runChild('node', args, {
    cwd: SOCIAL_DIR,
    timeoutMs: 180_000,
  })
  const ok = res.code === 0 && !res.timedOut
  const r = mkReceipt(
    'postToTikTok',
    ok,
    `dryRun=${!!dryRun} code=${res.code} video=${path.basename(videoPath)}`
  )
  await appendReceipt(r)
  return ok
    ? { ok, result: res, receipt: r }
    : { ok, result: res, error: res.stderr || `exit ${res.code}`, receipt: r }
}

export async function generateImage(
  raw: unknown
): Promise<ToolResult<{ outPath: string; spawn: SpawnResult }>> {
  const parsed = generateImageSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('generateImage', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { prompt, outPath, provider, force } = parsed.data
  await fs.mkdir(OUT_DIR, { recursive: true })
  // Use flag-based args so the multi-provider CLI parses reliably even when
  // prompt text contains spaces, quotes, or path-like substrings.
  const args = [SCRIPT_GEN_IMAGE, '--prompt', prompt]
  if (outPath) args.push('--out', outPath)
  if (provider) args.push('--provider', provider)
  if (force) args.push('--force')
  const res = await runChild('node', args, { cwd: SOCIAL_DIR, timeoutMs: 180_000 })
  const ok = res.code === 0 && !res.timedOut
  // stdout last line = final path (legacy contract). JSON payload is the
  // line before it — parse if present for richer receipts.
  const lines = (res.stdout || '').trim().split(/\r?\n/).filter(Boolean)
  const finalPath = lines[lines.length - 1] || ''
  let usedProvider = provider || 'auto'
  try {
    const maybeJson = lines.length >= 2 ? lines[lines.length - 2] : lines[0]
    const parsedJson = JSON.parse(maybeJson)
    if (parsedJson?.provider) usedProvider = parsedJson.provider
  } catch {
    // best-effort — receipt is still useful without it
  }
  const receipt = mkReceipt(
    'generateImage',
    ok,
    `prompt="${prompt.slice(0, 40)}" provider=${usedProvider} out=${finalPath || outPath || '?'} code=${res.code}`
  )
  await appendReceipt(receipt)
  return ok
    ? { ok, result: { outPath: finalPath, spawn: res }, receipt }
    : {
        ok,
        result: { outPath: finalPath, spawn: res },
        error: res.stderr || `exit ${res.code}`,
        receipt,
      }
}

export async function shellExec(raw: unknown): Promise<ToolResult<SpawnResult>> {
  const parsed = shellExecSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('shellExec', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { command, cwd, timeoutMs } = parsed.data
  // Use bash on POSIX, cmd.exe /c on Windows. Both accept a single string.
  const isWin = process.platform === 'win32'
  const shellBin = isWin ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh'
  const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command]
  const res = await runChild(shellBin, shellArgs, { cwd, timeoutMs })
  const ok = res.code === 0 && !res.timedOut
  const r = mkReceipt(
    'shellExec',
    ok,
    `cmd="${command.slice(0, 60)}" code=${res.code}${res.timedOut ? ' TIMEOUT' : ''}`
  )
  await appendReceipt(r)
  return ok
    ? { ok, result: res, receipt: r }
    : {
        ok,
        result: res,
        error: res.stderr || (res.timedOut ? 'timeout' : `exit ${res.code}`),
        receipt: r,
      }
}

// Shared playwright runner. Lazy-imports so the Next.js edge bundle never
// tries to pull in chromium.
async function launchProfile(): Promise<{
  ctx: unknown
  page: unknown
  closeAll: () => Promise<void>
}> {
  try {
    await fs.access(USER_DATA_DIR)
  } catch {
    throw new Error(`browser profile missing at ${USER_DATA_DIR}`)
  }
  // Use eval('require') to load playwright at runtime — this breaks webpack's static
  // dependency analysis so it never tries to bundle or resolve playwright at build time.
  // On Vercel (no playwright installed) this throws and we return BLOCKED, which is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-eval
  const pw: any = await Promise.resolve().then(() => eval('require')('playwright')).catch(() => null)
  if (!pw) throw new Error('playwright not available in this environment (local-only tool)')
  const ctx = await pw.chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const pages = ctx.pages()
  const page = pages.length ? pages[0] : await ctx.newPage()
  return {
    ctx,
    page,
    closeAll: async () => {
      try {
        await ctx.close()
      } catch {
        // ignore
      }
    },
  }
}

/**
 * Automate a username+password login on an arbitrary site. Session cookies
 * persist in the shared profile for reuse by postToX / postToTikTok / etc.
 *
 * If twoFactorHook is true and a 2FA prompt appears, this tool pings Bo on
 * Telegram and polls for a resume signal — never auto-solves.
 */
export async function browserLogin(raw: unknown): Promise<ToolResult<{ finalUrl: string }>> {
  const parsed = browserLoginSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('browserLogin', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const {
    url,
    usernameSelector,
    passwordSelector,
    username,
    password,
    submitSelector,
    twoFactorHook,
    telegramChatId,
  } = parsed.data

  let closeAll: (() => Promise<void>) | null = null
  try {
    const { page, closeAll: close } = await launchProfile()
    closeAll = close
    // Use `any` only at this boundary because playwright's page type is huge
    // and would force the entire file to import the types. The schema above
    // is what guards runtime safety.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = page as any
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await p.waitForTimeout(2_000)
    await p.fill(usernameSelector, username, { timeout: 15_000 })
    await p.fill(passwordSelector, password, { timeout: 15_000 })
    if (submitSelector) {
      await p.click(submitSelector, { timeout: 15_000 })
    } else {
      await p.keyboard.press('Enter')
    }
    await p.waitForTimeout(4_000)

    if (twoFactorHook) {
      // Heuristic: if URL still contains login path or a 2fa field appears,
      // page Bo and wait up to 3 minutes for him to reply "ok" in Telegram.
      const urlNow: string = p.url()
      if (/2fa|otp|verify|challenge|login/i.test(urlNow)) {
        if (telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
          try {
            await fetch(
              `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: telegramChatId,
                  text: `Jarvis paused on 2FA at ${urlNow}. Reply /resume when cleared.`,
                }),
              }
            )
          } catch {
            // non-fatal
          }
        }
        // poll for 3 minutes
        const deadline = Date.now() + 180_000
        while (Date.now() < deadline) {
          await p.waitForTimeout(5_000)
          if (!/2fa|otp|verify|challenge|login/i.test(p.url())) break
        }
      }
    }

    const finalUrl: string = p.url()
    const ok = !/login|signin/i.test(finalUrl)
    const receipt = mkReceipt(
      'browserLogin',
      ok,
      `url=${url} final=${finalUrl}`
    )
    await appendReceipt(receipt)
    return ok
      ? { ok, result: { finalUrl }, receipt }
      : { ok, result: { finalUrl }, error: `still on login-like URL: ${finalUrl}`, receipt }
  } catch (err) {
    const receipt = mkReceipt('browserLogin', false, getErrorMessage(err))
    await appendReceipt(receipt)
    return { ok: false, error: getErrorMessage(err), receipt }
  } finally {
    if (closeAll) await closeAll()
  }
}

/**
 * Higher-level account creation. For now, X / TikTok / generic form signup.
 * Credentials are APPENDED to .secrets/jarvis-accounts.env — never overwritten.
 * CAPTCHAs are NOT solved: the user is Telegram-paged and must /resume.
 */
export async function createAccount(
  raw: unknown
): Promise<ToolResult<{ service: string; username: string; finalUrl: string }>> {
  const parsed = createAccountSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('createAccount', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { service, email, username, password, signupUrl, fieldSelectors, telegramChatId } =
    parsed.data

  const serviceDefaults: Record<
    string,
    { url: string; email: string; username?: string; password: string; submit: string }
  > = {
    x: {
      url: 'https://x.com/i/flow/signup',
      email: 'input[name="email"]',
      password: 'input[name="password"]',
      submit: 'button[role="button"][data-testid*="Next"]',
    },
    tiktok: {
      url: 'https://www.tiktok.com/signup',
      email: 'input[name="email"]',
      username: 'input[name="username"]',
      password: 'input[type="password"]',
      submit: 'button[type="submit"]',
    },
    generic: {
      url: signupUrl ?? '',
      email: fieldSelectors?.email ?? 'input[type="email"]',
      username: fieldSelectors?.username ?? 'input[name="username"]',
      password: fieldSelectors?.password ?? 'input[type="password"]',
      submit: fieldSelectors?.submit ?? 'button[type="submit"]',
    },
  }

  const cfg = serviceDefaults[service]
  if (service === 'generic' && !signupUrl) {
    const r = mkReceipt('createAccount', false, 'generic service requires signupUrl')
    await appendReceipt(r)
    return { ok: false, error: 'generic service requires signupUrl', receipt: r }
  }

  let closeAll: (() => Promise<void>) | null = null
  try {
    const { page, closeAll: close } = await launchProfile()
    closeAll = close
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = page as any
    await p.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await p.waitForTimeout(3_000)

    await p.fill(cfg.email, email, { timeout: 15_000 }).catch(() => {})
    if (cfg.username) {
      await p.fill(cfg.username, username, { timeout: 15_000 }).catch(() => {})
    }
    await p.fill(cfg.password, password, { timeout: 15_000 }).catch(() => {})

    // Save credentials BEFORE clicking submit, so we keep a record even if
    // the signup flow is interrupted by CAPTCHA.
    await fs.mkdir(path.dirname(ACCOUNTS_FILE), { recursive: true })
    const line = `# ${now()} ${service}\n${service.toUpperCase()}_${username.toUpperCase()}_EMAIL=${email}\n${service.toUpperCase()}_${username.toUpperCase()}_USER=${username}\n${service.toUpperCase()}_${username.toUpperCase()}_PASS=${password}\n`
    await fs.appendFile(ACCOUNTS_FILE, line, 'utf8')

    await p.click(cfg.submit, { timeout: 15_000 }).catch(() => {})
    await p.waitForTimeout(5_000)

    // CAPTCHA / challenge detection — pause, page Bo, stop. Do NOT auto-solve.
    const htmlSnippet: string = await p.content().then((c: string) => c.slice(0, 8_000))
    const needsHuman = /captcha|recaptcha|hcaptcha|verify.?you.?are.?human/i.test(htmlSnippet)
    if (needsHuman && telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: `Jarvis blocked on CAPTCHA at ${p.url()} during ${service} signup for @${username}. Solve manually.`,
            }),
          }
        )
      } catch {
        // non-fatal
      }
    }

    const finalUrl: string = p.url()
    const ok = !needsHuman && !/signup|signin|login/i.test(finalUrl)
    const receipt = mkReceipt(
      'createAccount',
      ok,
      `service=${service} user=${username} needsHuman=${needsHuman} final=${finalUrl}`
    )
    await appendReceipt(receipt)
    return ok
      ? { ok, result: { service, username, finalUrl }, receipt }
      : {
          ok,
          result: { service, username, finalUrl },
          error: needsHuman ? 'CAPTCHA — human required' : `still on signup-like URL: ${finalUrl}`,
          receipt,
        }
  } catch (err) {
    const receipt = mkReceipt('createAccount', false, getErrorMessage(err))
    await appendReceipt(receipt)
    return { ok: false, error: getErrorMessage(err), receipt }
  } finally {
    if (closeAll) await closeAll()
  }
}

// ──────────────────────────────────────────────────────────────────────────
// speak — Jarvis text-to-speech via local Piper (en_GB-alan = Bettany-ish).
// Writes a .wav; optionally converts to .ogg/opus via ffmpeg and sends to
// Telegram sendVoice (falls back to sendAudio if ffmpeg fails). Free-first —
// never calls ElevenLabs / OpenAI / Azure TTS.
// ──────────────────────────────────────────────────────────────────────────

interface SpeakResult {
  path: string
  durationMs: number
  sizeBytes: number
  voice: SpeakVoice
  telegram?: { sent: boolean; method?: 'sendVoice' | 'sendAudio'; error?: string }
}

async function wavDurationMs(filePath: string): Promise<number> {
  // RIFF/WAVE header parse: sample rate at byte 24 (LE uint32),
  // byte rate at 28, data subchunk size after 'data' marker.
  try {
    const fh = await fs.open(filePath, 'r')
    try {
      const header = Buffer.alloc(44)
      await fh.read(header, 0, 44, 0)
      if (header.toString('ascii', 0, 4) !== 'RIFF') return 0
      const byteRate = header.readUInt32LE(28)
      const stat = await fh.stat()
      const dataBytes = Math.max(0, stat.size - 44)
      if (byteRate === 0) return 0
      return Math.round((dataBytes / byteRate) * 1000)
    } finally {
      await fh.close()
    }
  } catch {
    return 0
  }
}

async function sendTelegramVoice(
  wavPath: string,
  chatId: string
): Promise<{ sent: boolean; method?: 'sendVoice' | 'sendAudio'; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { sent: false, error: 'TELEGRAM_BOT_TOKEN not configured' }
  }

  // 1) try wav -> ogg/opus via ffmpeg, send as sendVoice
  const oggPath = wavPath.replace(/\.wav$/i, '.ogg')
  const ff = await runChild(
    'ffmpeg',
    ['-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on', oggPath],
    { timeoutMs: 60_000 }
  )

  if (ff.code === 0 && !ff.timedOut) {
    try {
      const buf = await fs.readFile(oggPath)
      const fd = new FormData()
      fd.append('chat_id', chatId)
      fd.append(
        'voice',
        new Blob([new Uint8Array(buf)], { type: 'audio/ogg' }),
        path.basename(oggPath)
      )
      const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
        method: 'POST',
        body: fd,
      })
      if (res.ok) return { sent: true, method: 'sendVoice' }
      return { sent: false, method: 'sendVoice', error: `HTTP ${res.status}` }
    } catch (err) {
      return { sent: false, method: 'sendVoice', error: getErrorMessage(err) }
    }
  }

  // 2) fallback: send the wav as sendAudio
  try {
    const buf = await fs.readFile(wavPath)
    const fd = new FormData()
    fd.append('chat_id', chatId)
    fd.append(
      'audio',
      new Blob([new Uint8Array(buf)], { type: 'audio/wav' }),
      path.basename(wavPath)
    )
    const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      body: fd,
    })
    if (res.ok) return { sent: true, method: 'sendAudio' }
    return { sent: false, method: 'sendAudio', error: `HTTP ${res.status}` }
  } catch (err) {
    return { sent: false, method: 'sendAudio', error: getErrorMessage(err) }
  }
}

export async function speak(raw: unknown): Promise<ToolResult<SpeakResult>> {
  const parsed = speakSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('speak', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { text, outPath, voice, sendToTelegram, telegramChatId } = parsed.data

  const voiceFile = PIPER_VOICES[voice]
  if (!voiceFile) {
    const r = mkReceipt('speak', false, `unknown voice alias: ${voice}`)
    await appendReceipt(r)
    return { ok: false, error: `unknown voice alias: ${voice}`, receipt: r }
  }
  const modelPath = path.join(PIPER_VOICES_DIR, voiceFile)
  try {
    await fs.access(modelPath)
  } catch {
    const r = mkReceipt('speak', false, `voice model missing: ${modelPath}`)
    await appendReceipt(r)
    return { ok: false, error: `voice model missing: ${modelPath}`, receipt: r }
  }

  await fs.mkdir(SPEECH_OUT_DIR, { recursive: true })
  const finalPath =
    outPath && outPath.length > 0
      ? outPath
      : path.join(SPEECH_OUT_DIR, `${Date.now()}.wav`)
  await fs.mkdir(path.dirname(finalPath), { recursive: true })

  // Spawn piper, pipe text via stdin. Piper is chatty on stderr — that's fine.
  const spawnRes: SpawnResult = await new Promise((resolve) => {
    const child = spawn(
      PIPER_EXE,
      ['--model', modelPath, '--output_file', finalPath],
      { shell: false, windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }, 60_000)
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', (err) => {
      stderr += '\nSPAWN_ERROR: ' + getErrorMessage(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: truncate(stdout), stderr: truncate(stderr), timedOut })
    })
    child.stdin.write(text)
    child.stdin.end()
  })

  if (spawnRes.code !== 0 || spawnRes.timedOut) {
    const receipt = mkReceipt(
      'speak',
      false,
      `piper exit=${spawnRes.code}${spawnRes.timedOut ? ' TIMEOUT' : ''} stderr=${spawnRes.stderr.slice(0, 120)}`
    )
    await appendReceipt(receipt)
    return {
      ok: false,
      error: spawnRes.stderr || (spawnRes.timedOut ? 'piper timeout' : `piper exit ${spawnRes.code}`),
      receipt,
    }
  }

  let sizeBytes = 0
  try {
    const st = await fs.stat(finalPath)
    sizeBytes = st.size
  } catch {
    // fall through
  }
  const durationMs = await wavDurationMs(finalPath)

  let telegram: SpeakResult['telegram']
  if (sendToTelegram) {
    const chatId = telegramChatId ?? TELEGRAM_DEFAULT_CHAT_ID
    telegram = await sendTelegramVoice(finalPath, chatId)
  }

  const receipt = mkReceipt(
    'speak',
    true,
    `voice=${voice} path=${finalPath} size=${sizeBytes} durMs=${durationMs}${
      telegram ? ` tg=${telegram.sent ? telegram.method : 'fail:' + telegram.error} ` : ''
    }text="${text.slice(0, 40)}"`
  )
  await appendReceipt(receipt)

  return {
    ok: true,
    result: { path: finalPath, durationMs, sizeBytes, voice, telegram },
    receipt,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// listen — Jarvis speech-to-text via local faster-whisper (CTranslate2).
// Spawns py transcribe.py, parses the JSON line from stdout. Free-first —
// never calls Whisper API or any cloud STT.
// ──────────────────────────────────────────────────────────────────────────

interface ListenResult {
  text: string
  language: string
  languageProbability: number
  durationSec: number
  durationMs: number
  elapsedMs: number
  model: string
  // Confidence proxy: average per-segment avg_logprob (higher = more confident,
  // typical good values are between -0.3 and 0.0).
  confidence: number
  segments: Array<{ start: number; end: number; text: string; avg_logprob: number }>
}

interface WhisperJsonOk {
  ok: true
  text: string
  language: string
  languageProbability: number
  durationSec: number
  elapsedMs: number
  model: string
  segments: Array<{ start: number; end: number; text: string; avg_logprob: number }>
}

interface WhisperJsonErr {
  ok: false
  error: string
}

function parseWhisperStdout(stdout: string): WhisperJsonOk | WhisperJsonErr | null {
  // transcribe.py prints exactly one JSON line to stdout. Be defensive — find
  // the last non-empty line that successfully parses as JSON with an `ok` field.
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]) as { ok?: unknown }
      if (typeof parsed.ok === 'boolean') return parsed as WhisperJsonOk | WhisperJsonErr
    } catch {
      continue
    }
  }
  return null
}

export async function listen(raw: unknown): Promise<ToolResult<ListenResult>> {
  const parsed = listenSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('listen', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { audioPath, language, model } = parsed.data
  const useModel = model || WHISPER_DEFAULT_MODEL

  // Verify the audio file exists before spawning python — cheap fail-fast.
  try {
    await fs.access(audioPath)
  } catch {
    const r = mkReceipt('listen', false, `audio missing: ${audioPath}`)
    await appendReceipt(r)
    return { ok: false, error: `audio file not found: ${audioPath}`, receipt: r }
  }

  // Verify the python helper exists.
  try {
    await fs.access(WHISPER_SCRIPT)
  } catch {
    const r = mkReceipt('listen', false, `whisper helper missing: ${WHISPER_SCRIPT}`)
    await appendReceipt(r)
    return {
      ok: false,
      error: `whisper helper missing: ${WHISPER_SCRIPT}. Reinstall with: py -m pip install --user faster-whisper`,
      receipt: r,
    }
  }

  const args = [WHISPER_SCRIPT, '--audio', audioPath, '--model', useModel]
  if (language) args.push('--language', language)

  // runChild merges this with process.env internally, but the strict
  // ProcessEnv shape requires NODE_ENV-style keys. Cast at the boundary.
  const res = await runChild(PYTHON_BIN, args, {
    cwd: WHISPER_DIR,
    timeoutMs: 180_000,
    env: { WHISPER_MODEL_DIR } as unknown as NodeJS.ProcessEnv,
  })

  if (res.timedOut) {
    const r = mkReceipt('listen', false, `whisper TIMEOUT model=${useModel} audio=${path.basename(audioPath)}`)
    await appendReceipt(r)
    return { ok: false, error: 'whisper transcription timeout (180s)', receipt: r }
  }

  const payload = parseWhisperStdout(res.stdout || '')
  if (!payload) {
    const stderrTail = (res.stderr || '').slice(-400)
    const r = mkReceipt(
      'listen',
      false,
      `whisper bad json exit=${res.code} stderr=${stderrTail.slice(0, 120)}`
    )
    await appendReceipt(r)
    return {
      ok: false,
      error: `whisper produced no parseable JSON (exit ${res.code}). stderr=${stderrTail}`,
      receipt: r,
    }
  }

  if (payload.ok === false) {
    const r = mkReceipt('listen', false, `whisper error: ${payload.error.slice(0, 120)}`)
    await appendReceipt(r)
    return { ok: false, error: payload.error, receipt: r }
  }

  // Compute mean logprob across segments as a confidence proxy.
  const logprobs = payload.segments.map((s) => s.avg_logprob)
  const confidence =
    logprobs.length > 0 ? logprobs.reduce((a, b) => a + b, 0) / logprobs.length : -1

  const result: ListenResult = {
    text: payload.text,
    language: payload.language,
    languageProbability: payload.languageProbability,
    durationSec: payload.durationSec,
    durationMs: Math.round(payload.durationSec * 1000),
    elapsedMs: payload.elapsedMs,
    model: payload.model,
    confidence: Math.round(confidence * 10000) / 10000,
    segments: payload.segments,
  }

  const receipt = mkReceipt(
    'listen',
    true,
    `model=${useModel} lang=${payload.language} audioMs=${result.durationMs} elapsedMs=${result.elapsedMs} conf=${result.confidence} text="${payload.text.slice(0, 60)}"`
  )
  await appendReceipt(receipt)

  return { ok: true, result, receipt }
}

// ──────────────────────────────────────────────────────────────────────────
// Registry / dispatcher
// ──────────────────────────────────────────────────────────────────────────

export async function getCalendar(
  raw: unknown
): Promise<ToolResult<{ events: CalendarEvent[] }>> {
  const parsed = getCalendarSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('getCalendar', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const days = parsed.data.days ?? 7
  try {
    const events = await getUpcomingEvents(days)
    const r = mkReceipt('getCalendar', true, `fetched ${events.length} events for next ${days} days`)
    await appendReceipt(r)
    return { ok: true, result: { events }, receipt: r }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt('getCalendar', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

export interface ToolEntry {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>
  run: (args: unknown) => Promise<ToolResult>
}

export const JARVIS_TOOLS: Record<string, ToolEntry> = {
  postToX: {
    name: 'postToX',
    description: 'Post a tweet to X/Twitter via the logged-in linda-profile.',
    schema: postToXSchema,
    run: postToX,
  },
  postToTikTok: {
    name: 'postToTikTok',
    description: 'Upload a video + caption to TikTok via the logged-in profile.',
    schema: postToTikTokSchema,
    run: postToTikTok,
  },
  generateImage: {
    name: 'generateImage',
    description:
      'Generate a PNG via free-first multi-provider chain (NVIDIA nvapi → Gemini 2.5 Flash Image → local ComfyUI). Returns the file path.',
    schema: generateImageSchema,
    run: generateImage,
  },
  shellExec: {
    name: 'shellExec',
    description: 'Execute a shell command, capture stdout/stderr (truncated).',
    schema: shellExecSchema,
    run: shellExec,
  },
  browserLogin: {
    name: 'browserLogin',
    description: 'Headless login to any URL; persists cookies in linda-profile.',
    schema: browserLoginSchema,
    run: browserLogin,
  },
  createAccount: {
    name: 'createAccount',
    description: 'Create a new account on X / TikTok / generic. Pauses on CAPTCHA.',
    schema: createAccountSchema,
    run: createAccount,
  },
  speak: {
    name: 'speak',
    description:
      'Text-to-speech via local Piper (free, offline). British male "JARVIS" voice (en_GB-alan). Optionally sends to Telegram as voice note.',
    schema: speakSchema,
    run: speak,
  },
  listen: {
    name: 'listen',
    description:
      'Speech-to-text via local faster-whisper (free, offline, CPU). Returns transcript + language + confidence. Default model: base.en (~140MB). Override with WHISPER_MODEL env or `model` arg (small.en, medium.en).',
    schema: listenSchema,
    run: listen,
  },
  getCalendar: {
    name: 'getCalendar',
    description: "Fetch upcoming calendar events from Bo's Google Calendar. Returns the next 7 days by default.",
    schema: getCalendarSchema,
    run: getCalendar,
  },
  createFolder: {
    name: 'createFolder',
    description: 'Create a directory (and any parent directories) on the local filesystem.',
    schema: createFolderSchema,
    run: createFolder,
  },
  writeDoc: {
    name: 'writeDoc',
    description: 'Write or append to a text file on the local filesystem. Creates parent directories if needed.',
    schema: writeDocSchema,
    run: writeDoc,
  },
  createCalendarEvent: {
    name: 'createCalendarEvent',
    description: "Create a new event on Bo's Google Calendar.",
    schema: createCalendarEventSchema,
    run: createCalendarEvent,
  },
  updateCalendarEvent: {
    name: 'updateCalendarEvent',
    description: "Update an existing event on Bo's Google Calendar by event ID.",
    schema: updateCalendarEventSchema,
    run: updateCalendarEvent,
  },
  deleteCalendarEvent: {
    name: 'deleteCalendarEvent',
    description: "Delete an event from Bo's Google Calendar by event ID.",
    schema: deleteCalendarEventSchema,
    run: deleteCalendarEvent,
  },
  syncCalendarToVault: {
    name: 'syncCalendarToVault',
    description:
      "Sync today's calendar events to the Obsidian COG vault daily note. Call this after fetching calendar if Bo wants events saved to Obsidian.",
    schema: syncCalendarToVaultSchema,
    run: syncCalendarToVault,
  },
  calculateEarnings: {
    name: 'calculateEarnings',
    description:
      "Calculate today's estimated earnings from Spotless Solutions calendar events using the known pricing structure. Returns revenue total and breakdown.",
    schema: calculateEarningsSchema,
    run: calculateEarnings,
  },
}

export async function dispatchTool(name: string, args: unknown): Promise<ToolResult> {
  const entry = JARVIS_TOOLS[name]
  if (!entry) {
    const r = mkReceipt('dispatch', false, `unknown tool: ${name}`)
    await appendReceipt(r)
    return { ok: false, error: `unknown tool: ${name}`, receipt: r }
  }
  return entry.run(args)
}
