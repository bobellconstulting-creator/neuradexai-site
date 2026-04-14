/**
 * Jarvis auto-reflection cron.
 *
 * Scans C:/Users/bobel/COG/01-daily/chats/<chatId>/<today>.jsonl for each chat.
 * For a chat:
 *   - if last turn is > 30 min old
 *   - AND >= 3 turns have happened since the last reflection
 * → POST the transcript to /api/jarvis/reflect.
 *
 * Per-chat state tracked in C:/Users/bobel/COG/.reflection-state.json.
 * Idempotent: safe to re-run every 30 min from PM2.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  buildTranscript,
  getSessionSince,
  listChatsForDay,
  lastTurnTsForDay,
} from '../lib/jarvis/conversation'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const STATE_FILE = path.join(VAULT_ROOT, '.reflection-state.json')
const REFLECT_URL =
  process.env.JARVIS_REFLECT_URL ?? 'http://localhost:3000/api/jarvis/reflect'

const IDLE_THRESHOLD_MS = 30 * 60 * 1000 // 30 min
const MIN_TURNS_SINCE_LAST = 3

interface ReflectionState {
  // chatId → { lastReflectedTs: ISO, lastReflectedTurnCount: number }
  [chatId: string]: {
    lastReflectedTs: string
    lastReflectedTurnCount: number
  }
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function readState(): Promise<ReflectionState> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as ReflectionState
    return {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    console.warn('[reflect] state read failed:', err instanceof Error ? err.message : err)
    return {}
  }
}

async function writeState(state: ReflectionState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true })
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
  await fs.rename(tmp, STATE_FILE)
}

interface ReflectResponse {
  success: boolean
  extractedCount?: number
  promotedCount?: number
  pendingCount?: number
  error?: string
}

async function callReflect(
  transcript: string,
  sessionId: string,
): Promise<ReflectResponse> {
  const res = await fetch(REFLECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, sessionId }),
  })
  const data = (await res.json().catch(() => null)) as ReflectResponse | null
  if (!data) {
    return { success: false, error: `bad response ${res.status}` }
  }
  return data
}

async function main(): Promise<void> {
  const ymd = todayYmd()
  const chats = await listChatsForDay(ymd)
  if (chats.length === 0) {
    console.log(`[reflect] no chats for ${ymd}`)
    return
  }

  const state = await readState()
  const now = Date.now()
  let mutated = false

  for (const chatId of chats) {
    const lastTs = await lastTurnTsForDay(chatId, ymd)
    if (!lastTs) continue

    const ageMs = now - Date.parse(lastTs)
    if (ageMs < IDLE_THRESHOLD_MS) {
      // Still active, wait for quiet.
      continue
    }

    const since =
      state[chatId]?.lastReflectedTs ??
      new Date(now - 24 * 60 * 60 * 1000).toISOString() // default: last 24h

    const turns = await getSessionSince(chatId, since)
    if (turns.length < MIN_TURNS_SINCE_LAST) {
      continue
    }

    const transcript = buildTranscript(turns)
    const sessionId = `telegram-${chatId}-${ymd}`
    const result: ReflectResponse = await callReflect(transcript, sessionId).catch(
      (err): ReflectResponse => ({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    )

    if (result.success) {
      console.log(
        `[reflect] chat=${chatId} turns=${turns.length} extracted=${result.extractedCount ?? 0} promoted=${result.promotedCount ?? 0}`,
      )
      state[chatId] = {
        lastReflectedTs: lastTs,
        lastReflectedTurnCount: turns.length,
      }
      mutated = true
    } else {
      console.warn(
        `[reflect] chat=${chatId} turns=${turns.length} FAILED: ${result.error ?? 'unknown'}`,
      )
    }
  }

  if (mutated) {
    await writeState(state)
  }
}

main().catch((err) => {
  console.error('[reflect] cron fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
