/**
 * GET /api/jarvis/proactive-log
 *
 * Returns the last 10 proactive/cron-sourced turns from the conversation store.
 * Filters for assistant turns where meta.source === 'proactive' or 'cron',
 * or where meta.isProactive === true.
 * No auth — local HUD only.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const CHATS_DIR = path.join(VAULT_ROOT, '01-daily', 'chats')

interface RawTurn {
  role: 'user' | 'assistant'
  content: string
  ts: string
  meta?: Record<string, unknown>
}

export interface ProactiveMessage {
  ts: string
  content: string
  source: string
}

function todayYmd(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseJsonl(raw: string): RawTurn[] {
  const out: RawTurn[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const parsed = JSON.parse(t) as Record<string, unknown>
      if (
        (parsed.role === 'user' || parsed.role === 'assistant') &&
        typeof parsed.content === 'string' &&
        typeof parsed.ts === 'string'
      ) {
        out.push(parsed as unknown as RawTurn)
      }
    } catch {
      // skip malformed lines
    }
  }
  return out
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function isProactive(turn: RawTurn): boolean {
  if (turn.role !== 'assistant') return false
  const src = turn.meta?.source
  return src === 'proactive' || src === 'cron' || turn.meta?.isProactive === true
}

async function collectProactiveForDay(ymd: string): Promise<ProactiveMessage[]> {
  let chatDirs: string[] = []
  try {
    const entries = await fs.readdir(CHATS_DIR, { withFileTypes: true })
    chatDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }

  const all: ProactiveMessage[] = []
  for (const chatDir of chatDirs) {
    const filePath = path.join(CHATS_DIR, chatDir, `${ymd}.jsonl`)
    const raw = await readIfExists(filePath)
    if (!raw) continue
    for (const t of parseJsonl(raw)) {
      if (isProactive(t)) {
        all.push({
          ts: t.ts,
          content: t.content,
          source: String(t.meta?.source ?? 'proactive'),
        })
      }
    }
  }
  return all
}

export async function GET() {
  const today = todayYmd()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = todayYmd(y)

  const [todayMsgs, yesterdayMsgs] = await Promise.all([
    collectProactiveForDay(today),
    collectProactiveForDay(yesterday),
  ])

  const merged = [...yesterdayMsgs, ...todayMsgs]
  merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  const messages = merged.slice(-10)

  return NextResponse.json({ ok: true, messages })
}
