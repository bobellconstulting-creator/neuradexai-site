/**
 * scripts/jarvis-meeting-alert.ts
 *
 * Standalone one-shot script — no server, just runs and exits.
 * Checks Google Calendar for events starting within 5–15 minutes.
 * If found, sends a Telegram alert: "NEXT UP in {N} min: {title} — {N} attendees"
 *
 * Run via PM2 cron_restart every 10 minutes (see ecosystem.config.js).
 *
 * Env: loaded from .env.local via dotenv/config.
 *   GOOGLE_OAUTH_REFRESH_TOKEN (or file at ~/.secrets/google-oauth.json)
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   TELEGRAM_BOT_TOKEN
 *   JARVIS_OWNER_CHAT_ID
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────

const OAUTH_JSON_PATH = 'C:/Users/bobel/.secrets/google-oauth.json'
const TOKEN_URL       = 'https://oauth2.googleapis.com/token'
const CALENDAR_API    = 'https://www.googleapis.com/calendar/v3'

const ALERT_MIN_MINUTES = 5
const ALERT_MAX_MINUTES = 15
// Look-ahead window: a bit past the max so we catch events at exactly 15 min
const LOOK_AHEAD_MS = (ALERT_MAX_MINUTES + 1) * 60 * 1_000

const ALL_CALENDAR_IDS = [
  'primary',
  'spotlesssolutionscg@gmail.com',
  'family13136250949179599592@group.calendar.google.com',
]

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface StoredTokens {
  refresh_token: string
}

interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
  error_description?: string
}

interface CalendarEventRaw {
  id?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  attendees?: unknown[]
}

interface CalendarListResponse {
  items?: CalendarEventRaw[]
}

// ──────────────────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────────────────

function readRefreshToken(): string {
  const envToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (envToken) return envToken

  try {
    const raw = readFileSync(OAUTH_JSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as StoredTokens
    if (typeof parsed.refresh_token === 'string') return parsed.refresh_token
  } catch {
    // fall through
  }
  throw new Error('Google OAuth not configured: no refresh_token found')
}

async function getAccessToken(): Promise<string> {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set')
  }

  const refreshToken = readRefreshToken()

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await res.json() as TokenResponse
  if (!res.ok || data.error) {
    throw new Error(`Token refresh failed: ${data.error ?? res.status} — ${data.error_description ?? ''}`)
  }

  return data.access_token
}

// ──────────────────────────────────────────────────────────────────────────
// Calendar fetch
// ──────────────────────────────────────────────────────────────────────────

async function fetchEventsFromCalendar(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEventRaw[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  })
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const data = await res.json() as CalendarListResponse
  return Array.isArray(data.items) ? data.items : []
}

// ──────────────────────────────────────────────────────────────────────────
// Telegram
// ──────────────────────────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.JARVIS_OWNER_CHAT_ID
  if (!botToken || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or JARVIS_OWNER_CHAT_ID not set')
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  const data = await res.json() as { ok: boolean; description?: string }
  if (!data.ok) {
    throw new Error(`Telegram sendMessage failed: ${data.description ?? res.status}`)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now       = Date.now()
  const timeMin   = new Date(now).toISOString()
  const timeMax   = new Date(now + LOOK_AHEAD_MS).toISOString()

  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    console.error('[meeting-alert] auth failed:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const results = await Promise.all(
    ALL_CALENDAR_IDS.map((id) => fetchEventsFromCalendar(token, id, timeMin, timeMax))
  )

  const seen = new Set<string>()
  const allEvents = results.flat().filter((ev) => {
    const id = ev.id ?? ''
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })

  // Find events starting within the 5–15 minute window
  const alerts: { minutesAway: number; summary: string; attendeeCount: number }[] = []

  for (const ev of allEvents) {
    const startStr = ev.start?.dateTime ?? ev.start?.date
    if (!startStr) continue

    const startMs      = new Date(startStr).getTime()
    const minutesAway  = Math.round((startMs - now) / 60_000)

    if (minutesAway < ALERT_MIN_MINUTES || minutesAway > ALERT_MAX_MINUTES) continue

    const summary       = typeof ev.summary === 'string' ? ev.summary : '(no title)'
    const attendeeCount = Array.isArray(ev.attendees) ? ev.attendees.length : 0
    alerts.push({ minutesAway, summary, attendeeCount })
  }

  if (alerts.length === 0) {
    console.log('[meeting-alert] no upcoming meetings in the 5–15 min window')
    process.exit(0)
  }

  // Send one message per alert (sorted by time ascending)
  alerts.sort((a, b) => a.minutesAway - b.minutesAway)

  for (const alert of alerts) {
    const attendeePart = alert.attendeeCount > 0 ? ` — ${alert.attendeeCount} attendees` : ''
    const text = `NEXT UP in ${alert.minutesAway} min: ${alert.summary}${attendeePart}`
    try {
      await sendTelegram(text)
      console.log('[meeting-alert] sent:', text)
    } catch (err) {
      console.error('[meeting-alert] send failed:', err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('[meeting-alert] fatal:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
