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
  readDoc,
  readDocSchema,
  queueResearch,
  queueResearchSchema,
} from './tools-fs'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  deleteCalendarEventSchema,
} from './tools-calendar'
import {
  learnTopic,
  learnTopicSchema,
  searchKnowledge,
  searchKnowledgeSchema,
} from './tools-learning'
import {
  createJarvisTask,
  createJarvisTaskSchema,
  listJarvisTasks,
  listJarvisTasksSchema,
  completeJarvisTask,
  completeJarvisTaskSchema,
} from './tools-tasks'
import {
  searchWeb,
  searchWebSchema,
  fetchUrl,
  fetchUrlSchema,
  githubOps,
  githubOpsSchema,
  sendTelegramMessage,
  sendTelegramMessageSchema,
  systemInfo,
  systemInfoSchema,
  vercelDeploy,
  vercelDeploySchema,
  telegramPollIdeas,
  telegramPollIdeasSchema,
} from './tools-web'
import { sendEmail, sendEmailSchema, readEmail, readEmailSchema } from './tools-email'
import { createEtsyListing, createEtsyListingSchema } from './tools-etsy'
import {
  createMeritAccount,
  createMeritAccountSchema,
} from './tools-accounts'
import { findProspects, findProspectsSchema } from './tools-consulting'
import { runClaudeCode, runClaudeCodeSchema } from './tools-claude-code'
import {
  storeCredential,
  storeCredentialSchema,
  getCredential,
  getCredentialSchema,
  listCredentials,
  listCredentialsSchema,
} from './tools-vault'

export {
  storeCredential,
  storeCredentialSchema,
  getCredential,
  getCredentialSchema,
  listCredentials,
  listCredentialsSchema,
}

export { runClaudeCode, runClaudeCodeSchema }

export {
  searchWeb,
  searchWebSchema,
  fetchUrl,
  fetchUrlSchema,
  githubOps,
  githubOpsSchema,
  sendTelegramMessage,
  sendTelegramMessageSchema,
  systemInfo,
  systemInfoSchema,
  vercelDeploy,
  vercelDeploySchema,
  telegramPollIdeas,
  telegramPollIdeasSchema,
  createFolder,
  writeDoc,
  createFolderSchema,
  writeDocSchema,
  syncCalendarToVault,
  syncCalendarToVaultSchema,
  calculateEarnings,
  calculateEarningsSchema,
  readDoc,
  readDocSchema,
  queueResearch,
  queueResearchSchema,
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

export const speakVoiceEnum = z.enum(['alan', 'adam'])
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

export const localBridgeExecSchema = z.object({
  cmd: z.string().max(500).describe('Shell command to run on Bo\'s local machine'),
  timeout: z.number().optional().describe('Timeout in seconds, default 30'),
})
export type LocalBridgeExecArgs = z.infer<typeof localBridgeExecSchema>

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
  const blockedMsg =
    'BLOCKED: shellExec requires local gateway execution. Use the OpenClaw gateway at port 18789 or the local bridge. Cannot run on Vercel serverless.'
  const r = mkReceipt('shellExec', false, blockedMsg)
  await appendReceipt(r)
  return { ok: false, result: undefined, receipt: r }
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
  const blockedMsg =
    'BLOCKED: browserLogin requires local gateway execution. Use the OpenClaw gateway at port 18789 or the local bridge. Cannot run on Vercel serverless.'
  const r = mkReceipt('browserLogin', false, blockedMsg)
  await appendReceipt(r)
  return { ok: false, result: undefined, receipt: r }
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
  const blockedMsg =
    'BLOCKED: createAccount requires local gateway execution. Use the OpenClaw gateway at port 18789 or the local bridge. Cannot run on Vercel serverless.'
  const r = mkReceipt('createAccount', false, blockedMsg)
  await appendReceipt(r)
  return { ok: false, result: undefined, receipt: r }
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

  // ── ElevenLabs path (paid, opt-in only) ──────────────────────────────────
  const useElevenLabs =
    !!process.env.ELEVENLABS_API_KEY &&
    (voice === 'adam' || process.env.JARVIS_VOICE_ENGINE === 'elevenlabs')

  if (useElevenLabs) {
    await fs.mkdir(SPEECH_OUT_DIR, { recursive: true })
    const mp3Path =
      outPath && outPath.length > 0
        ? outPath
        : path.join(SPEECH_OUT_DIR, `${Date.now()}.mp3`)
    await fs.mkdir(path.dirname(mp3Path), { recursive: true })

    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const ttsRes = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!ttsRes.ok) {
        const errBody = await ttsRes.text().catch(() => '')
        const r = mkReceipt('speak', false, `elevenlabs /api/tts ${ttsRes.status}: ${errBody.slice(0, 120)}`)
        await appendReceipt(r)
        return { ok: false, error: `ElevenLabs TTS failed: ${ttsRes.status}`, receipt: r }
      }
      const audioBytes = Buffer.from(await ttsRes.arrayBuffer())
      await fs.writeFile(mp3Path, audioBytes)
      const sizeBytes = audioBytes.length
      const durationMs = Math.round((sizeBytes / 128_000) * 8 * 1000) // rough estimate for mp3

      let telegram: SpeakResult['telegram']
      if (sendToTelegram) {
        const chatId = telegramChatId ?? TELEGRAM_DEFAULT_CHAT_ID
        telegram = await sendTelegramVoice(mp3Path, chatId)
      }

      const receipt = mkReceipt(
        'speak',
        true,
        `voice=adam(elevenlabs) path=${mp3Path} size=${sizeBytes} durMs=${durationMs}${
          telegram ? ` tg=${telegram.sent ? telegram.method : 'fail:' + telegram.error} ` : ''
        }text="${text.slice(0, 40)}"`
      )
      await appendReceipt(receipt)
      return {
        ok: true,
        result: { path: mp3Path, durationMs, sizeBytes, voice: 'adam', telegram },
        receipt,
      }
    } catch (e) {
      const r = mkReceipt('speak', false, `elevenlabs error: ${getErrorMessage(e).slice(0, 120)}`)
      await appendReceipt(r)
      return { ok: false, error: getErrorMessage(e), receipt: r }
    }
  }
  // ── /ElevenLabs path ─────────────────────────────────────────────────────

  // Piper TTS requires spawning a local .exe and writing to local disk —
  // neither is possible on Vercel serverless.
  const blockedMsg =
    'BLOCKED: speak (Piper TTS) requires local gateway execution. Use the OpenClaw gateway at port 18789 or the local bridge. Cannot run on Vercel serverless.'
  const r = mkReceipt('speak', false, blockedMsg)
  await appendReceipt(r)
  return { ok: false, result: undefined, receipt: r }
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
  const blockedMsg =
    'BLOCKED: listen (Whisper STT) requires local gateway execution. Use the OpenClaw gateway at port 18789 or the local bridge. Cannot run on Vercel serverless.'
  const r = mkReceipt('listen', false, blockedMsg)
  await appendReceipt(r)
  return { ok: false, result: undefined, receipt: r }
}

// ──────────────────────────────────────────────────────────────────────────
// delegateToClaudeCode — dispatch a task to the local Claude Code CLI.
//
// At Bo's discretion only — Jarvis NEVER auto-triggers this. Wait for Bo to
// explicitly say "use Claude Code" / "delegate to Claude" etc.
//
// Spawns: claude --print --no-update "<task>" via cmd /c on Windows.
// Timeout: 120 seconds hard cap.
// Output: truncated to 4000 chars.
// ──────────────────────────────────────────────────────────────────────────

const CLAUDE_DEFAULT_CWD = 'C:/Users/bobel/projects/neuradexai'
const CLAUDE_TIMEOUT_MS = 120_000

export const delegateToClaudeCodeSchema = z.object({
  task: z.string().min(1).max(8000),
  cwd: z.string().optional(),
  budgetUsd: z.number().min(0.01).max(2.0).optional().default(0.50),
})

interface ClaudeCodeResult {
  output: string
  exitCode: number | null
}

export async function delegateToClaudeCode(raw: unknown): Promise<ToolResult<ClaudeCodeResult>> {
  const parsed = delegateToClaudeCodeSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('delegateToClaudeCode', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { task, cwd } = parsed.data
  const workDir = cwd || CLAUDE_DEFAULT_CWD

  const contextPrefix = [
    `Working directory: ${workDir}`,
    'Project: Neuradex AI (Next.js 14, TypeScript, Tailwind)',
    `Task: ${task}`,
    '',
    'Respond with only the changes made and file paths. Be concise.',
  ].join('\n')

  // Try `claude` directly first; if spawn error, fall back to `cmd /c claude`
  async function attempt(useCmd: boolean): Promise<SpawnResult> {
    if (useCmd) {
      return runChild(
        process.env.ComSpec || 'cmd.exe',
        ['/c', 'claude', '--print', '--no-update', contextPrefix],
        { cwd: workDir, timeoutMs: CLAUDE_TIMEOUT_MS }
      )
    }
    return runChild(
      'claude',
      ['--print', '--no-update', contextPrefix],
      { cwd: workDir, timeoutMs: CLAUDE_TIMEOUT_MS }
    )
  }

  let res = await attempt(false)

  // SPAWN_ERROR means the binary wasn't found — retry via cmd /c
  if (!res.timedOut && res.code !== 0 && res.stderr.includes('SPAWN_ERROR')) {
    res = await attempt(true)
  }

  if (res.timedOut) {
    const r = mkReceipt('delegateToClaudeCode', false, `claude CLI timeout (120s) task="${task.slice(0, 60)}"`)
    await appendReceipt(r)
    return { ok: false, error: 'delegateToClaudeCode failed: timeout after 120 seconds', receipt: r }
  }

  const output = truncate((res.stdout || '').trim() || (res.stderr || '').trim(), 4000)

  if (res.code !== 0) {
    const reason = (res.stderr || '').slice(0, 300) || `exit ${res.code}`
    const r = mkReceipt('delegateToClaudeCode', false, `claude exit=${res.code} stderr=${reason.slice(0, 120)}`)
    await appendReceipt(r)
    return {
      ok: false,
      error: `delegateToClaudeCode failed: ${reason}`,
      receipt: r,
    }
  }

  const r = mkReceipt(
    'delegateToClaudeCode',
    true,
    `exit=${res.code} cwd=${workDir} task="${task.slice(0, 60)}"`
  )
  await appendReceipt(r)

  return {
    ok: true,
    result: { output, exitCode: res.code },
    receipt: r,
  }
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

export async function localBridgeExec(args: unknown): Promise<ToolResult> {
  const parsed = localBridgeExecSchema.safeParse(args)
  if (!parsed.success) {
    const r = mkReceipt('localBridgeExec', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { cmd, timeout } = parsed.data
  const bridgeUrl = process.env.LOCAL_BRIDGE_URL
  const secret = process.env.LOCAL_BRIDGE_SECRET
  if (!bridgeUrl || !secret) {
    const msg = 'BLOCKED: LOCAL_BRIDGE_URL or LOCAL_BRIDGE_SECRET not configured. Bridge server must be running locally and URL set in Vercel env vars.'
    const r = mkReceipt('localBridgeExec', false, msg)
    await appendReceipt(r)
    return { ok: false, result: null, receipt: r }
  }
  try {
    const res = await fetch(`${bridgeUrl}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ cmd, timeout }),
      signal: AbortSignal.timeout(((timeout ?? 30) * 1000) + 5_000),
    })
    if (!res.ok) {
      const msg = `BLOCKED: bridge returned ${res.status}`
      const r = mkReceipt('localBridgeExec', false, msg)
      await appendReceipt(r)
      return { ok: false, result: null, receipt: r }
    }
    const data = await res.json() as { exitCode: number; stdout: string; stderr: string }
    const receipt = mkReceipt('localBridgeExec', data.exitCode === 0, `exit ${data.exitCode} | stdout: ${String(data.stdout).slice(0, 300)}`)
    await appendReceipt(receipt)
    return { ok: data.exitCode === 0, result: data, receipt }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt('localBridgeExec', false, msg)
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
  readDoc: {
    name: 'readDoc',
    description: 'Read the contents of a file from the COG Obsidian vault. Path is relative to vault root (e.g. "RESEARCH-QUEUE.md" or "00-inbox/MY-INTERESTS.md").',
    schema: readDocSchema,
    run: readDoc,
  },
  queueResearch: {
    name: 'queueResearch',
    description: 'Add a topic to the research queue (COG/RESEARCH-QUEUE.md). Jarvis will research it automatically overnight. Use when Bo asks to "queue up", "add to research list", or "look into later".',
    schema: queueResearchSchema,
    run: queueResearch,
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
  learnTopic: {
    name: 'learnTopic',
    description:
      'Research and permanently store knowledge about any topic in the COG vault. Use when Bo says "go learn about X" or "research X for me". Stores facts as instincts that will surface in future conversations automatically.',
    schema: learnTopicSchema,
    run: learnTopic,
  },
  searchKnowledge: {
    name: 'searchKnowledge',
    description:
      'Search stored COG knowledge for facts relevant to a topic or question. Use proactively when Bo asks about something Jarvis may have learned previously.',
    schema: searchKnowledgeSchema,
    run: searchKnowledge,
  },
  createJarvisTask: {
    name: 'createJarvisTask',
    description: "Create a new task. Use when Bo asks Jarvis to add, create, or schedule a task.",
    schema: createJarvisTaskSchema,
    run: createJarvisTask,
  },
  listJarvisTasks: {
    name: 'listJarvisTasks',
    description: "List Bo's active tasks.",
    schema: listJarvisTasksSchema,
    run: listJarvisTasks,
  },
  completeJarvisTask: {
    name: 'completeJarvisTask',
    description: "Mark a task as done.",
    schema: completeJarvisTaskSchema,
    run: completeJarvisTask,
  },
  delegateToClaudeCode: {
    name: 'delegateToClaudeCode',
    description:
      'Delegate a coding or research task to the local Claude Code CLI. USE ONLY when Bo explicitly asks to use Claude Code. Never auto-trigger. Budget defaults to $0.50, max $2.00.',
    schema: delegateToClaudeCodeSchema,
    run: delegateToClaudeCode,
  },
  searchWeb: {
    name: 'searchWeb',
    description: 'Search the live web via Tavily. Use for current events, real-time info, research, prices, or anything that may be outside training data. Returns a direct answer plus source snippets.',
    schema: searchWebSchema,
    run: searchWeb,
  },
  fetchUrl: {
    name: 'fetchUrl',
    description: 'Fetch a URL and return its text content. Use to read articles, docs, or any webpage Bo links to.',
    schema: fetchUrlSchema,
    run: fetchUrl,
  },
  githubOps: {
    name: 'githubOps',
    description: "Interact with GitHub: list PRs, list issues, create issues, comment on issues, list repos, get commits. Default repo: bobellconstulting-creator/neuradexai-site.",
    schema: githubOpsSchema,
    run: githubOps,
  },
  sendTelegramMessage: {
    name: 'sendTelegramMessage',
    description: "Send a Telegram message to Bo or the fleet. Defaults to Bo's chat. Use for notifications, alerts, or pinging team agents.",
    schema: sendTelegramMessageSchema,
    run: sendTelegramMessage,
  },
  systemInfo: {
    name: 'systemInfo',
    description: "Get the server's current system status: CPU, memory, uptime, hostname. Use when Bo asks about server health or resource usage.",
    schema: systemInfoSchema,
    run: systemInfo,
  },
  vercelDeploy: {
    name: 'vercelDeploy',
    description: "Trigger a Vercel production deployment for neuradexai. Use when Bo says 'deploy' or 'push to production'.",
    schema: vercelDeploySchema,
    run: vercelDeploy,
  },
  localBridgeExec: {
    name: 'localBridgeExec',
    description: "Execute a shell command on Bo's local machine via the local bridge server. Use when shellExec is BLOCKED on Vercel. Requires LOCAL_BRIDGE_URL and LOCAL_BRIDGE_SECRET env vars.",
    schema: localBridgeExecSchema,
    run: localBridgeExec,
  },
  sendEmail: {
    name: 'sendEmail',
    description: 'Send an email via Gmail SMTP. Use when Bo asks to email someone or send a notification. Requires SMTP_USER and SMTP_PASS env vars.',
    schema: sendEmailSchema,
    run: sendEmail,
  },
  readEmail: {
    name: 'readEmail',
    description: 'Read recent emails from Gmail inbox via IMAP. Returns sender, subject, and snippet for each message. Use when Bo asks to check email, read inbox, or when a cron job monitors for new mail. Requires SMTP_USER and SMTP_PASS env vars with IMAP enabled.',
    schema: readEmailSchema,
    run: readEmail,
  },
  createEtsyListing: {
    name: 'createEtsyListing',
    description: 'Create a DRAFT product listing on Printify (Etsy POD). Draft only — not published until Bo reviews. Requires PRINTIFY_API_KEY and PRINTIFY_SHOP_ID env vars.',
    schema: createEtsyListingSchema,
    run: createEtsyListing,
  },
  createMeritAccount: {
    name: 'createMeritAccount',
    description:
      'Create a new account on Printify, Etsy, Gumroad, or Pinterest using Playwright automation on Bo\'s local machine via the local bridge. Stores credentials in Vault automatically. Use when Bo asks to set up accounts for the Merit income agent, or says "create the Printify account" / "set up Etsy" / "create Gumroad account". Pinterest requires a manual step (no script).',
    schema: createMeritAccountSchema,
    run: createMeritAccount,
  },
  findProspects: {
    name: 'findProspects',
    description: 'Research potential consulting prospects via web search and write findings to COG/04-projects/neuradex-consulting/prospects.md. Use when Bo says "find me leads", "research prospects", or "who should I pitch".',
    schema: findProspectsSchema,
    run: findProspects,
  },
  storeCredential: {
    name: 'storeCredential',
    description:
      'Store or update a credential in the local vault (~/.secrets/jarvis-vault.json). Upserts by service slug. Use when Bo creates a new account or rotates a password. Passwords are never logged.',
    schema: storeCredentialSchema,
    run: storeCredential,
  },
  getCredential: {
    name: 'getCredential',
    description:
      'Retrieve a stored credential from the vault by service name. Returns username, password, url, notes, and updatedAt. For tool use only — never surface passwords in Telegram messages.',
    schema: getCredentialSchema,
    run: getCredential,
  },
  listCredentials: {
    name: 'listCredentials',
    description:
      'List all services stored in the credential vault. Returns service names, usernames, urls, and timestamps. Passwords are NOT included in the list.',
    schema: listCredentialsSchema,
    run: listCredentials,
  },
  runClaudeCode: {
    name: 'runClaudeCode',
    description: 'Spawn Claude Code CLI to complete a coding task, build a feature, fix a bug, or run an analysis. Returns the full output. Use when Bo asks to build something, fix code, or when a task requires writing/running code. Requires claude CLI on PATH.',
    schema: runClaudeCodeSchema,
    run: runClaudeCode as (args: unknown) => Promise<ToolResult>,
  },
  telegramPollIdeas: {
    name: 'telegramPollIdeas',
    description: "Poll Telegram for new idea/capture/note messages from Bo. Returns new messages with prefix stripped. Used by the idea-capture cron. Automatically tracks offset to avoid reprocessing.",
    schema: telegramPollIdeasSchema,
    run: telegramPollIdeas as (args: unknown) => Promise<ToolResult>,
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
