/**
 * Jarvis filesystem tools — createFolder, writeDoc, syncCalendarToVault, calculateEarnings.
 *
 * Each tool follows the standard { ok, result?, error?, receipt } contract
 * used by the rest of the tool belt.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { ToolResult } from './tools'
import { getUpcomingEvents, type CalendarEvent } from '@/lib/google/calendar'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers (scoped to this module — not re-exported)
// ──────────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(tool: string, ok: boolean, detail: string): string {
  return `[${now()}] ${tool} ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Sink must never break the tool.
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error: ' + String(error)
}

// ──────────────────────────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────────────────────────

export const createFolderSchema = z.object({
  path: z.string().min(1),
})
export type CreateFolderArgs = z.infer<typeof createFolderSchema>

export const writeDocSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  append: z.boolean().optional().default(false),
})
export type WriteDocArgs = z.infer<typeof writeDocSchema>

export const syncCalendarToVaultSchema = z.object({
  days: z.number().optional().default(1),
})
export type SyncCalendarToVaultArgs = z.infer<typeof syncCalendarToVaultSchema>

export const calculateEarningsSchema = z.object({
  date: z.string().optional(),
})
export type CalculateEarningsArgs = z.infer<typeof calculateEarningsSchema>

// ──────────────────────────────────────────────────────────────────────────
// Implementations
// ──────────────────────────────────────────────────────────────────────────

export async function createFolder(
  raw: unknown
): Promise<ToolResult<{ path: string }>> {
  const parsed = createFolderSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('createFolder', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { path: dirPath } = parsed.data
  try {
    await fs.mkdir(dirPath, { recursive: true })
    const r = mkReceipt('createFolder', true, `created ${dirPath}`)
    await appendReceipt(r)
    return { ok: true, result: { path: dirPath }, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('createFolder', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

export async function writeDoc(
  raw: unknown
): Promise<ToolResult<{ path: string; bytes: number }>> {
  const parsed = writeDocSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('writeDoc', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { path: filePath, content, append } = parsed.data
  try {
    // Ensure parent directory exists before writing.
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    if (append) {
      await fs.appendFile(filePath, content, 'utf8')
    } else {
      await fs.writeFile(filePath, content, 'utf8')
    }
    const bytes = Buffer.byteLength(content, 'utf8')
    const r = mkReceipt(
      'writeDoc',
      true,
      `${append ? 'appended' : 'wrote'} ${bytes}B to ${filePath}`
    )
    await appendReceipt(r)
    return { ok: true, result: { path: filePath, bytes }, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('writeDoc', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Calendar → Obsidian vault sync
// ──────────────────────────────────────────────────────────────────────────

const COG_DAILY_DIR = 'C:/Users/bobel/COG/01-daily'
const CT_TZ = 'America/Chicago'

function todayInCT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CT_TZ })
}

function formatTimeForTable(iso: string): string {
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
  const safe = (s: string) => s.replace(/\|/g, '\\|')

  const rows =
    events.length === 0
      ? '*(no events)*'
      : events
          .map((ev) => {
            const time = formatTimeForTable(ev.start)
            const location = ev.location ?? '—'
            return `| ${safe(time)} | ${safe(ev.summary)} | ${safe(location)} |`
          })
          .join('\n')

  return `${header}${rows}\n\n*Last synced: ${syncedAt} CT*\n`
}

async function upsertCalendarSection(filePath: string, section: string): Promise<void> {
  let existing = ''
  try {
    existing = await fs.readFile(filePath, 'utf8')
  } catch {
    // File doesn't exist yet — create it below.
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true })

  if (existing.length === 0) {
    await fs.writeFile(filePath, section, 'utf8')
    return
  }

  const SECTION_RE = /^## Calendar[^]*?(?=^## |\z)/m
  if (SECTION_RE.test(existing)) {
    await fs.writeFile(filePath, existing.replace(SECTION_RE, section), 'utf8')
  } else {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n'
    await fs.writeFile(filePath, existing + separator + section, 'utf8')
  }
}

export async function syncCalendarToVault(
  raw: unknown
): Promise<ToolResult<{ eventsWritten: number; path: string }>> {
  const parsed = syncCalendarToVaultSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('syncCalendarToVault', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  try {
    const date = todayInCT()
    const events = await getUpcomingEvents(parsed.data.days)
    const todayEvents = events.filter((ev) => ev.start.startsWith(date))
    const section = buildCalendarSection(date, todayEvents)
    const notePath = path.join(COG_DAILY_DIR, `${date}.md`)

    await upsertCalendarSection(notePath, section)

    const r = mkReceipt(
      'syncCalendarToVault',
      true,
      `wrote ${todayEvents.length} events to ${notePath}`
    )
    await appendReceipt(r)
    return { ok: true, result: { eventsWritten: todayEvents.length, path: notePath }, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('syncCalendarToVault', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Earnings calculator — Spotless Solutions pricing
// ──────────────────────────────────────────────────────────────────────────

interface PricingRule {
  keyword: string
  revenue: number
  label: string
}

const SPOTLESS_PRICING: PricingRule[] = [
  { keyword: 'smokey valley', revenue: 250, label: 'Smokey Valley Seed' },
  { keyword: 'hilltop', revenue: 150, label: 'Hilltop' },
  { keyword: 'community building', revenue: 150, label: 'Community Building' },
  { keyword: 'congregational', revenue: 0, label: 'Congregational (monthly flat — $350/mo)' },
  { keyword: 'residential', revenue: 40, label: 'Residential (hourly)' },
]

interface EarningsResult {
  date: string
  total: number
  jobCount: number
  breakdown: string[]
  message: string
}

export async function calculateEarnings(
  raw: unknown
): Promise<ToolResult<EarningsResult>> {
  const parsed = calculateEarningsSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('calculateEarnings', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  try {
    const targetDate = parsed.data.date ?? todayInCT()
    const events = await getUpcomingEvents(1)
    const dayEvents = events.filter((ev) => ev.start.startsWith(targetDate))

    if (dayEvents.length === 0) {
      const result: EarningsResult = {
        date: targetDate,
        total: 0,
        jobCount: 0,
        breakdown: [],
        message: `No jobs found for ${targetDate}`,
      }
      const r = mkReceipt('calculateEarnings', true, `0 jobs on ${targetDate}`)
      await appendReceipt(r)
      return { ok: true, result, receipt: r }
    }

    let total = 0
    const breakdown: string[] = []

    for (const event of dayEvents) {
      const summary = event.summary.toLowerCase()
      const rule = SPOTLESS_PRICING.find((p) => summary.includes(p.keyword))
      if (rule) {
        total += rule.revenue
        const hasJessica =
          summary.includes('(j)') ||
          summary.includes('jessica') ||
          summary.includes('j-')
        const laborNote = hasJessica ? ' (Jessica assisting — deduct $20/hr labor)' : ''
        breakdown.push(`${rule.label}: $${rule.revenue}${laborNote}`)
      } else {
        breakdown.push(`${event.summary}: unknown pricing`)
      }
    }

    const result: EarningsResult = {
      date: targetDate,
      total,
      jobCount: dayEvents.length,
      breakdown,
      message: `${dayEvents.length} job${dayEvents.length > 1 ? 's' : ''} — estimated $${total}`,
    }
    const r = mkReceipt('calculateEarnings', true, result.message)
    await appendReceipt(r)
    return { ok: true, result, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('calculateEarnings', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}
