/**
 * Conversation store for Jarvis — persistent, append-only, per-chat/day.
 *
 * Storage layout (canonical):
 *   C:/Users/bobel/COG/01-daily/chats/<chatId>/<YYYY-MM-DD>.jsonl   (machine)
 *   C:/Users/bobel/COG/01-daily/<YYYY-MM-DD>-chat.md                (human, all chats merged)
 *
 * The JSONL file is the source of truth. The markdown mirror is a
 * human-readable reflection Bo browses in Obsidian. Both are append-only.
 *
 * A small in-memory LRU cache (5 chats × 50 turns, 10-min TTL) serves hot reads.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const CHATS_DIR = path.join(VAULT_ROOT, '01-daily', 'chats')
const DAILY_DIR = path.join(VAULT_ROOT, '01-daily')

const LRU_MAX_CHATS = 5
const LRU_MAX_TURNS_PER_CHAT = 50
const LRU_TTL_MS = 10 * 60 * 1000

// ─── Types ─────────────────────────────────────────────────────────────────

export const TurnRoleSchema = z.enum(['user', 'assistant'])
export type TurnRole = z.infer<typeof TurnRoleSchema>

export const TurnSchema = z.object({
  chatId: z.string().min(1).max(200),
  role: TurnRoleSchema,
  content: z.string().min(1).max(32_000),
  ts: z.string(),
  meta: z.record(z.unknown()).optional(),
})
export type Turn = z.infer<typeof TurnSchema>

// ─── Date helpers ──────────────────────────────────────────────────────────

function todayYmd(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function ymdFromIso(iso: string): string {
  return todayYmd(new Date(iso))
}

function sanitizeChatId(chatId: string): string {
  // Allow only filesystem-safe chars; Telegram ids are digits, but be defensive.
  return chatId.replace(/[^a-zA-Z0-9_\-.]/g, '_')
}

function chatDayFile(chatId: string, ymd: string): string {
  return path.join(CHATS_DIR, sanitizeChatId(chatId), `${ymd}.jsonl`)
}

function dailyChatMdFile(ymd: string): string {
  return path.join(DAILY_DIR, `${ymd}-chat.md`)
}

// ─── Filesystem helpers ────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// ─── LRU cache ─────────────────────────────────────────────────────────────

interface CacheEntry {
  turns: Turn[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(chatId: string, ymd: string): string {
  return `${sanitizeChatId(chatId)}:${ymd}`
}

function cacheGet(chatId: string, ymd: string): Turn[] | null {
  const key = cacheKey(chatId, ymd)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  // LRU: re-insert to move to end.
  cache.delete(key)
  cache.set(key, entry)
  return entry.turns
}

function cacheSet(chatId: string, ymd: string, turns: Turn[]): void {
  const key = cacheKey(chatId, ymd)
  if (cache.size >= LRU_MAX_CHATS && !cache.has(key)) {
    // Evict oldest (first inserted).
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  const trimmed = turns.slice(-LRU_MAX_TURNS_PER_CHAT)
  cache.set(key, { turns: trimmed, expiresAt: Date.now() + LRU_TTL_MS })
}

function cacheInvalidate(chatId: string, ymd: string): void {
  cache.delete(cacheKey(chatId, ymd))
}

// ─── JSONL serialization ───────────────────────────────────────────────────

function serializeTurn(turn: Turn): string {
  return JSON.stringify(turn) + '\n'
}

function parseJsonlFile(raw: string): Turn[] {
  const out: Turn[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = TurnSchema.safeParse(JSON.parse(trimmed))
      if (parsed.success) out.push(parsed.data)
    } catch {
      // Skip malformed line — append-only file may have a partial tail.
    }
  }
  return out
}

// ─── Markdown mirror ───────────────────────────────────────────────────────

function formatTurnForMd(turn: Turn): string {
  const when = turn.ts
  const roleLabel = turn.role === 'user' ? 'Bo' : 'Jarvis'
  const header = `### ${when} — ${roleLabel} (chat ${turn.chatId})`
  const body = turn.content.trim()
  return `${header}\n\n${body}\n\n`
}

async function appendToDailyMd(turn: Turn): Promise<void> {
  const ymd = ymdFromIso(turn.ts)
  const file = dailyChatMdFile(ymd)
  await ensureDir(path.dirname(file))
  const existing = await readIfExists(file)
  const chunk = formatTurnForMd(turn)
  if (existing === null) {
    const header = `# Chat log — ${ymd}\n\nHuman-readable conversation log for ${ymd}. JSONL source: \`chats/<chatId>/${ymd}.jsonl\`.\n\n---\n\n`
    await fs.writeFile(file, header + chunk, 'utf8')
    return
  }
  // Append-only. fs.appendFile is atomic enough for line-wise writes on both Windows & POSIX.
  await fs.appendFile(file, chunk, 'utf8')
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Append a turn to the chat's JSONL file and to the day's markdown mirror.
 * Append-only. Safe to call concurrently (fs.appendFile).
 */
export async function appendTurn(
  chatId: string,
  role: TurnRole,
  content: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const id = chatId.trim()
  if (!id) throw new Error('appendTurn: chatId required')
  const body = content.trim()
  if (!body) return // silently drop empty turns

  const turn: Turn = {
    chatId: id,
    role,
    content: body,
    ts: new Date().toISOString(),
    ...(meta ? { meta } : {}),
  }

  const ymd = ymdFromIso(turn.ts)
  const jsonlFile = chatDayFile(id, ymd)
  await ensureDir(path.dirname(jsonlFile))
  await fs.appendFile(jsonlFile, serializeTurn(turn), 'utf8')

  // Best-effort MD mirror — don't fail the whole append if MD write hiccups.
  try {
    await appendToDailyMd(turn)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.warn('[conversation] MD mirror append failed:', msg)
  }

  // Invalidate cache — next read re-hydrates from disk including the new turn.
  cacheInvalidate(id, ymd)
}

/**
 * Return recent turns for a chat, newest-last. Defaults to last 20.
 * Reads today's JSONL file first; if too few turns, falls back to yesterday.
 */
export async function getHistory(chatId: string, limit = 20): Promise<Turn[]> {
  const id = chatId.trim()
  if (!id) return []
  const today = todayYmd()

  const cached = cacheGet(id, today)
  let turns: Turn[]
  if (cached) {
    turns = cached
  } else {
    const raw = await readIfExists(chatDayFile(id, today))
    turns = raw ? parseJsonlFile(raw) : []
    cacheSet(id, today, turns)
  }

  if (turns.length >= limit) return turns.slice(-limit)

  // Pull from yesterday's file too, if needed, to fill the window.
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = todayYmd(y)
  const rawYest = await readIfExists(chatDayFile(id, yesterday))
  const yestTurns = rawYest ? parseJsonlFile(rawYest) : []
  const merged = [...yestTurns, ...turns]
  return merged.slice(-limit)
}

/**
 * Return all turns for a chat whose timestamp is >= sinceIso.
 * Used by the reflection cron to scope transcripts.
 */
export async function getSessionSince(chatId: string, sinceIso: string): Promise<Turn[]> {
  const id = chatId.trim()
  if (!id) return []
  const sinceMs = Date.parse(sinceIso)
  if (Number.isNaN(sinceMs)) return []

  // Scan today and yesterday (enough for a 30-min reflection window).
  const days: string[] = []
  const today = new Date()
  days.push(todayYmd(today))
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  days.push(todayYmd(y))

  const collected: Turn[] = []
  for (const ymd of days) {
    const raw = await readIfExists(chatDayFile(id, ymd))
    if (!raw) continue
    for (const turn of parseJsonlFile(raw)) {
      if (Date.parse(turn.ts) >= sinceMs) collected.push(turn)
    }
  }
  collected.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  return collected
}

/**
 * List all chat ids that have a JSONL file for the given date.
 * Used by the cron scanner.
 */
export async function listChatsForDay(ymd: string): Promise<string[]> {
  await ensureDir(CHATS_DIR)
  const entries = await fs.readdir(CHATS_DIR, { withFileTypes: true }).catch(() => [])
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = path.join(CHATS_DIR, entry.name, `${ymd}.jsonl`)
    const stat = await fs.stat(file).catch(() => null)
    if (stat) out.push(entry.name)
  }
  return out
}

/**
 * Get the last turn's timestamp for a chat on a given day, or null.
 */
export async function lastTurnTsForDay(chatId: string, ymd: string): Promise<string | null> {
  const raw = await readIfExists(chatDayFile(chatId, ymd))
  if (!raw) return null
  const turns = parseJsonlFile(raw)
  const last = turns[turns.length - 1]
  return last?.ts ?? null
}

/**
 * Build a plain-text transcript suitable for POST /api/jarvis/reflect.
 */
export function buildTranscript(turns: Turn[]): string {
  return turns
    .map((t) => {
      const who = t.role === 'user' ? 'Bo' : 'Jarvis'
      return `${who}: ${t.content}`
    })
    .join('\n\n')
}
