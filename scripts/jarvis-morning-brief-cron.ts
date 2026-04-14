/**
 * jarvis-morning-brief-cron.ts
 *
 * Runs once at 7am CT via PM2 cron_restart.
 * Fetches calendar, checks for blocked tasks, sends Telegram brief.
 * No daemon. Exits after send.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

// ── Config ────────────────────────────────────────────────────────────────────

const CALENDAR_URL =
  process.env.JARVIS_CALENDAR_URL ?? 'http://localhost:3000/api/google/calendar'
const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const QUEUE_FILE = 'C:/Users/bobel/team-workspace/QUEUE.md'

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ?? ''
const CHAT_ID =
  process.env.TELEGRAM_CHAT_ID ?? process.env.BO_TELEGRAM_ID ?? '7240677590'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

interface CalendarApiResponse {
  events?: CalendarEvent[]
  items?: CalendarEvent[]
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function yesterdayYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayLabel(): string {
  const d = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
}

function formatEventTime(event: CalendarEvent): string {
  const raw = event.start?.dateTime ?? event.start?.date
  if (!raw) return ''
  if (!raw.includes('T')) return 'all day'
  const t = new Date(raw)
  const h = t.getHours()
  const m = t.getMinutes()
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

// ── Calendar ──────────────────────────────────────────────────────────────────

async function fetchCalendarSection(): Promise<string> {
  try {
    const res = await fetch(`${CALENDAR_URL}?days=1`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.warn(`[morning-brief] calendar API ${res.status}`)
      return ''
    }
    const data = (await res.json().catch(() => null)) as CalendarApiResponse | null
    if (!data) return ''

    const events: CalendarEvent[] = data.events ?? data.items ?? []
    if (events.length === 0) {
      return 'Calendar is clear today, sir.'
    }

    const count = events.length
    const summaries = events
      .slice(0, 4)
      .map((e) => {
        const time = formatEventTime(e)
        const title = e.summary ?? 'Unnamed event'
        return time ? `${time} ${title}` : title
      })
      .join(', ')

    const label = count === 1 ? '1 event' : `${count} events`
    return `Calendar: ${label} today — ${summaries}.`
  } catch (err) {
    console.warn('[morning-brief] calendar fetch failed:', err instanceof Error ? err.message : err)
    return ''
  }
}

// ── Blocked tasks ─────────────────────────────────────────────────────────────

async function fetchBlockedSection(): Promise<string> {
  // Primary: read QUEUE.md ## BLOCKED table
  try {
    const raw = await fs.readFile(QUEUE_FILE, 'utf8')
    const blockedMatch = raw.match(/## BLOCKED\s*\n([\s\S]*?)(?=\n## |\n---|\Z)/)
    if (blockedMatch) {
      const block = blockedMatch[1]
      // Parse table rows (skip header row with ---|---|---)
      const rows = block
        .split('\n')
        .filter((l) => l.startsWith('|') && !l.match(/^[| -]+$/))
        .map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))
        .filter((cols) => cols.length >= 2 && cols[0] !== 'ID')

      if (rows.length > 0) {
        const count = rows.length
        const label = count === 1 ? 'one blocked item' : `${count} blocked items`
        // Surface first item's blocker description
        const first = rows[0]
        const blocker = first[1] ?? first[0]
        const suffix = count > 1 ? ` (plus ${count - 1} more)` : ''
        return `Carried over: ${label} — ${blocker}${suffix}.`
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[morning-brief] QUEUE.md read failed:', err instanceof Error ? err.message : err)
    }
  }

  // Fallback: check yesterday's daily note for BLOCKED lines
  try {
    const ymd = yesterdayYmd()
    const notePath = path.join(VAULT_ROOT, '01-daily', `${ymd}.md`)
    const raw = await fs.readFile(notePath, 'utf8')
    const blockedLines = raw
      .split('\n')
      .filter((l) => /BLOCKED/i.test(l))
      .slice(0, 3)

    if (blockedLines.length > 0) {
      const count = blockedLines.length
      const label = count === 1 ? 'one blocked item' : `${count} blocked items`
      const first = blockedLines[0].replace(/^[#*\->\s]+/, '').trim()
      return `Carried from yesterday: ${label} — ${first}.`
    }
  } catch {
    // silently skip — daily note may not exist yet
  }

  return ''
}

// ── Telegram send ─────────────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not set')
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Telegram API ${res.status}: ${body}`)
  }
}

// ── Brief assembly ────────────────────────────────────────────────────────────

function assembleBrief(
  dateLabel: string,
  calendarSection: string,
  blockedSection: string,
): string {
  const lines: string[] = [`Good morning, sir. ${dateLabel}.`, '']

  if (calendarSection) {
    lines.push(calendarSection, '')
  }

  if (blockedSection) {
    lines.push(blockedSection, '')
  }

  lines.push("I'm at your disposal.")

  return lines.join('\n').trim()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dateLabel = todayLabel()

  // Fetch calendar and blocked sections in parallel; neither blocks the other
  const [calendarSection, blockedSection] = await Promise.all([
    fetchCalendarSection(),
    fetchBlockedSection(),
  ])

  const brief = assembleBrief(dateLabel, calendarSection, blockedSection)

  await sendTelegram(brief)
  console.warn('[morning-brief] sent OK')
}

main().catch((err) => {
  console.error('[morning-brief] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
