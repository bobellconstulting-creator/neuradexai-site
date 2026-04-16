/**
 * GET /api/jarvis/live-feed
 *
 * Returns the last 20 Jarvis turns across all chat IDs, newest-last.
 * Scans today's JSONL files; falls back to yesterday if under 20 turns.
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
  chatId?: string
  role: 'user' | 'assistant'
  content: string
  ts: string
  meta?: Record<string, unknown>
}

export interface FeedTurn {
  role: 'user' | 'assistant'
  content: string
  ts: string
  toolCalls?: Array<{ name: string; ok: boolean; durationMs?: number }>
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

async function collectTurnsForDay(ymd: string): Promise<FeedTurn[]> {
  let chatDirs: string[] = []
  try {
    const entries = await fs.readdir(CHATS_DIR, { withFileTypes: true })
    chatDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }

  const all: FeedTurn[] = []
  for (const chatDir of chatDirs) {
    const filePath = path.join(CHATS_DIR, chatDir, `${ymd}.jsonl`)
    const raw = await readIfExists(filePath)
    if (!raw) continue
    const turns = parseJsonl(raw)
    for (const t of turns) {
      const toolCalls = Array.isArray(t.meta?.toolCalls)
        ? (t.meta!.toolCalls as Array<{ name: string; ok: boolean; durationMs?: number }>)
        : undefined
      all.push({ role: t.role, content: t.content, ts: t.ts, toolCalls })
    }
  }
  return all
}

export async function GET() {
  const today = todayYmd()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = todayYmd(y)

  const [todayTurns, yesterdayTurns] = await Promise.all([
    collectTurnsForDay(today),
    collectTurnsForDay(yesterday),
  ])

  const merged = [...yesterdayTurns, ...todayTurns]
  merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  const turns = merged.slice(-20)

  return NextResponse.json({ ok: true, turns })
}
