/**
 * POST /api/jarvis/calendar-sync
 *
 * Fetches today's calendar events and writes them as a ## Calendar section
 * into the COG vault daily note at C:/Users/bobel/COG/01-daily/<YYYY-MM-DD>.md.
 *
 * Returns { ok, eventsWritten, path }
 */
import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getUpcomingEvents, type CalendarEvent } from '@/lib/google/calendar'

const COG_DAILY_DIR = 'C:/Users/bobel/COG/01-daily'
const CT_TZ = 'America/Chicago'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function todayInCT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CT_TZ }) // YYYY-MM-DD
}

/**
 * Format an ISO datetime string to 12-hour CT time, e.g. "10:00 AM".
 * If the string is a bare date (YYYY-MM-DD), returns "All day".
 */
function formatTime(iso: string): string {
  // All-day events come in as YYYY-MM-DD (10 chars, no 'T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'All day'
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: CT_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return iso
  }
}

function buildCalendarSection(date: string, events: CalendarEvent[]): string {
  const syncedAt = new Date().toLocaleString('en-US', {
    timeZone: CT_TZ,
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const header = `## Calendar — ${date}\n\n| Time | Event | Location |\n|------|-------|----------|\n`

  const rows = events
    .map((ev) => {
      const time = formatTime(ev.start)
      const location = ev.location ?? '—'
      // Escape pipe chars in cell values
      const safe = (s: string) => s.replace(/\|/g, '\\|')
      return `| ${safe(time)} | ${safe(ev.summary)} | ${safe(location)} |`
    })
    .join('\n')

  const noEvents = events.length === 0 ? '*(no events)*' : rows

  return `${header}${noEvents}\n\n*Last synced: ${syncedAt} CT*\n`
}

/**
 * Upsert the ## Calendar section in the daily note.
 * Replaces an existing section, or appends if not found.
 */
async function upsertCalendarSection(filePath: string, section: string): Promise<void> {
  let existing = ''
  try {
    existing = await fs.readFile(filePath, 'utf8')
  } catch {
    // File doesn't exist yet — we'll create it.
  }

  if (existing.length === 0) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, section, 'utf8')
    return
  }

  // Replace existing ## Calendar section (everything up to next ## or end of file)
  const SECTION_RE = /^## Calendar[^]*?(?=^## |\z)/m
  if (SECTION_RE.test(existing)) {
    const updated = existing.replace(SECTION_RE, section)
    await fs.writeFile(filePath, updated, 'utf8')
  } else {
    // No existing Calendar section — append
    const separator = existing.endsWith('\n') ? '\n' : '\n\n'
    await fs.writeFile(filePath, existing + separator + section, 'utf8')
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
  try {
    const date = todayInCT()
    const events = await getUpcomingEvents(1)

    // Filter to only today's events
    const todayEvents = events.filter((ev) => ev.start.startsWith(date))

    const section = buildCalendarSection(date, todayEvents)
    const notePath = path.join(COG_DAILY_DIR, `${date}.md`)

    await upsertCalendarSection(notePath, section)

    return NextResponse.json({ ok: true, eventsWritten: todayEvents.length, path: notePath })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
