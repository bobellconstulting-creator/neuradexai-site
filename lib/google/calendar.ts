/**
 * Google Calendar client — raw fetch, no google-auth-library.
 *
 * Token storage: C:/Users/bobel/.secrets/google-oauth.json
 * In-memory access token cache with 55-minute TTL.
 */
import { readFileSync } from 'node:fs'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const OAUTH_JSON_PATH = 'C:/Users/bobel/.secrets/google-oauth.json'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_CACHE_TTL_MS = 55 * 60 * 1_000 // 55 minutes

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ')

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  location?: string
  description?: string
}

interface StoredTokens {
  refresh_token: string
  access_token?: string
  expiry?: number
}

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  error?: string
  error_description?: string
}

// ──────────────────────────────────────────────────────────────────────────
// In-memory token cache
// ──────────────────────────────────────────────────────────────────────────

let cachedAccessToken: string | null = null
let cacheExpiresAt = 0

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function readStoredTokens(): StoredTokens | null {
  try {
    const raw = readFileSync(OAUTH_JSON_PATH, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'refresh_token' in parsed &&
      typeof (parsed as Record<string, unknown>).refresh_token === 'string'
    ) {
      return parsed as StoredTokens
    }
    return null
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns a fresh access token, using in-memory cache when possible.
 * Reads refresh_token from the stored JSON file on each cache miss.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedAccessToken && now < cacheExpiresAt) {
    return cachedAccessToken
  }

  const stored = readStoredTokens()
  if (!stored?.refresh_token) {
    throw new Error('Google OAuth not configured: no refresh_token in ' + OAUTH_JSON_PATH)
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: stored.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data: TokenResponse = await res.json() as TokenResponse
  if (!res.ok || data.error) {
    throw new Error(
      `Token refresh failed: ${data.error ?? res.status} — ${data.error_description ?? ''}`
    )
  }

  cachedAccessToken = data.access_token
  cacheExpiresAt = Date.now() + TOKEN_CACHE_TTL_MS
  return data.access_token
}

/**
 * Returns the OAuth2 authorization URL. Opens in browser to start the auth flow.
 * Includes calendar + gmail.readonly scopes with offline access.
 */
export function getAuthUrl(): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_REDIRECT_URI not set')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Calendar IDs to fetch — all owned/shared calendars so Jarvis sees the full picture.
// spotlesssolutionscg@gmail.com = cleaning business schedule (Bo's actual work calendar)
// primary = consulting/personal
// family = family events
const ALL_CALENDAR_IDS = [
  'primary',
  'spotlesssolutionscg@gmail.com',
  'family13136250949179599592@group.calendar.google.com',
]

async function fetchEventsFromCalendar(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  const encodedId = encodeURIComponent(calendarId)
  const url = `${CALENDAR_API}/calendars/${encodedId}/events?${params.toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return [] // skip inaccessible calendars silently
  const data: unknown = await res.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    !('items' in data) ||
    !Array.isArray((data as Record<string, unknown>).items)
  ) return []
  return (data as { items: unknown[] }).items
    .map((item): CalendarEvent | null => {
      if (typeof item !== 'object' || item === null) return null
      const ev = item as Record<string, unknown>
      const id = typeof ev.id === 'string' ? ev.id : ''
      const summary = typeof ev.summary === 'string' ? ev.summary : '(no title)'
      const startObj = ev.start as Record<string, unknown> | undefined
      const endObj = ev.end as Record<string, unknown> | undefined
      const start = (startObj?.dateTime ?? startObj?.date ?? '') as string
      const end = (endObj?.dateTime ?? endObj?.date ?? '') as string
      if (!id || !start) return null
      const event: CalendarEvent = { id, summary, start, end }
      if (typeof ev.location === 'string') event.location = ev.location
      if (typeof ev.description === 'string') event.description = ev.description
      return event
    })
    .filter((e): e is CalendarEvent => e !== null)
}

/**
 * Fetches upcoming events from ALL of Bo's calendars (primary + Spotless + Family).
 * Merges and sorts by start time so Jarvis sees the full picture.
 * @param days — how many days ahead to look (default 7)
 * @param calendarId — override to fetch from a single calendar ID
 */
export async function getUpcomingEvents(days = 7, calendarId?: string): Promise<CalendarEvent[]> {
  const token = await getAccessToken()

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString()

  const ids = calendarId ? [calendarId] : ALL_CALENDAR_IDS
  const results = await Promise.all(
    ids.map((id) => fetchEventsFromCalendar(token, id, timeMin, timeMax))
  )
  const merged = results.flat()
  // Deduplicate by id (same event can appear across calendar views)
  const seen = new Set<string>()
  const unique = merged.filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
  return unique.sort((a, b) => a.start.localeCompare(b.start))
}

// ── Legacy single-calendar fetch kept for internal use ──────────────────────
async function fetchPrimaryEvents(days = 7): Promise<CalendarEvent[]> {
  const token = await getAccessToken()
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString()

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const url = `${CALENDAR_API}/calendars/primary/events?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar API error ${res.status}: ${body.slice(0, 300)}`)
  }

  const data: unknown = await res.json()

  // Narrow the response shape
  if (
    typeof data !== 'object' ||
    data === null ||
    !('items' in data) ||
    !Array.isArray((data as Record<string, unknown>).items)
  ) {
    return []
  }

  const items = (data as { items: unknown[] }).items

  return items
    .map((item): CalendarEvent | null => {
      if (typeof item !== 'object' || item === null) return null
      const ev = item as Record<string, unknown>
      const id = typeof ev.id === 'string' ? ev.id : ''
      const summary = typeof ev.summary === 'string' ? ev.summary : '(no title)'
      const startObj = ev.start as Record<string, unknown> | undefined
      const endObj = ev.end as Record<string, unknown> | undefined
      const start = (startObj?.dateTime ?? startObj?.date ?? '') as string
      const end = (endObj?.dateTime ?? endObj?.date ?? '') as string
      if (!id || !start) return null
      const event: CalendarEvent = { id, summary, start, end }
      if (typeof ev.location === 'string') event.location = ev.location
      if (typeof ev.description === 'string') event.description = ev.description
      return event
    })
    .filter((e): e is CalendarEvent => e !== null)
}

// ──────────────────────────────────────────────────────────────────────────
// Calendar write helpers
// ──────────────────────────────────────────────────────────────────────────

export interface CreateEventInput {
  summary: string
  start: string        // ISO 8601 datetime, e.g. "2026-04-15T10:00:00"
  end: string          // ISO 8601 datetime
  description?: string
  location?: string
  timeZone?: string    // default "America/Chicago"
}

function buildEventBody(
  input: CreateEventInput
): Record<string, unknown> {
  const tz = input.timeZone ?? 'America/Chicago'
  const body: Record<string, unknown> = {
    summary: input.summary,
    start: { dateTime: input.start, timeZone: tz },
    end: { dateTime: input.end, timeZone: tz },
  }
  if (input.description !== undefined) body.description = input.description
  if (input.location !== undefined) body.location = input.location
  return body
}

function parseEventResponse(raw: unknown): CalendarEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Unexpected Calendar API response shape')
  }
  const ev = raw as Record<string, unknown>
  const id = typeof ev.id === 'string' ? ev.id : ''
  const summary = typeof ev.summary === 'string' ? ev.summary : '(no title)'
  const startObj = ev.start as Record<string, unknown> | undefined
  const endObj = ev.end as Record<string, unknown> | undefined
  const start = ((startObj?.dateTime ?? startObj?.date) ?? '') as string
  const end = ((endObj?.dateTime ?? endObj?.date) ?? '') as string
  const event: CalendarEvent = { id, summary, start, end }
  if (typeof ev.location === 'string') event.location = ev.location
  if (typeof ev.description === 'string') event.description = ev.description
  return event
}

/**
 * Create a new event on the primary calendar.
 */
export async function createCalendarEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const token = await getAccessToken()
  const url = `${CALENDAR_API}/calendars/primary/events`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventBody(input)),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar create failed ${res.status}: ${body.slice(0, 300)}`)
  }
  return parseEventResponse(await res.json())
}

/**
 * Patch an existing event. Only fields present in `patch` are sent.
 */
export async function updateCalendarEvent(
  eventId: string,
  patch: Partial<CreateEventInput>,
): Promise<CalendarEvent> {
  const token = await getAccessToken()
  const url = `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`

  const tz = patch.timeZone ?? 'America/Chicago'
  const body: Record<string, unknown> = {}
  if (patch.summary !== undefined) body.summary = patch.summary
  if (patch.start !== undefined) body.start = { dateTime: patch.start, timeZone: tz }
  if (patch.end !== undefined) body.end = { dateTime: patch.end, timeZone: tz }
  if (patch.description !== undefined) body.description = patch.description
  if (patch.location !== undefined) body.location = patch.location

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Calendar update failed ${res.status}: ${text.slice(0, 300)}`)
  }
  return parseEventResponse(await res.json())
}

/**
 * Delete an event by ID. Treats 204 (and 404 for idempotency) as success.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken()
  const url = `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Calendar delete failed ${res.status}: ${text.slice(0, 300)}`)
  }
}
