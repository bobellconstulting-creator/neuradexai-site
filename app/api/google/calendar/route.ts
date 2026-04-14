/**
 * GET  /api/google/calendar          — list upcoming events (?days=N)
 * POST /api/google/calendar          — create a new calendar event
 * PATCH /api/google/calendar?id=XXX  — update an existing event
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getUpcomingEvents,
  getAuthUrl,
  createCalendarEvent,
  updateCalendarEvent,
} from '@/lib/google/calendar'
import { existsSync, readFileSync } from 'node:fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OAUTH_JSON_PATH = 'C:/Users/bobel/.secrets/google-oauth.json'

function isAuthenticated(): boolean {
  try {
    if (!existsSync(OAUTH_JSON_PATH)) return false
    const raw = readFileSync(OAUTH_JSON_PATH, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).refresh_token === 'string' &&
      ((parsed as Record<string, unknown>).refresh_token as string).length > 0
    )
  } catch {
    return false
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthenticated()) {
    let authUrl: string
    try {
      authUrl = getAuthUrl()
    } catch {
      authUrl = '/api/google/auth'
    }
    return NextResponse.json(
      { ok: false, error: 'not_authenticated', authUrl },
      { status: 401 }
    )
  }

  const daysParam = request.nextUrl.searchParams.get('days')
  const days = daysParam ? parseInt(daysParam, 10) : 7
  const safeDays = Number.isFinite(days) && days > 0 && days <= 90 ? days : 7

  try {
    const events = await getUpcomingEvents(safeDays)
    return NextResponse.json({ ok: true, events })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthenticated()) {
    return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }
  const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
  const start   = typeof body.start   === 'string' ? body.start.trim()   : ''
  const end     = typeof body.end     === 'string' ? body.end.trim()     : ''
  if (!summary || !start || !end) {
    return NextResponse.json({ ok: false, error: 'summary, start, end required' }, { status: 400 })
  }
  try {
    const event = await createCalendarEvent({
      summary,
      start,
      end,
      description: typeof body.description === 'string' ? body.description : undefined,
      location:    typeof body.location    === 'string' ? body.location    : undefined,
      timeZone:    typeof body.timeZone    === 'string' ? body.timeZone    : 'America/Chicago',
    })
    return NextResponse.json({ ok: true, event })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isAuthenticated()) {
    return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })
  }
  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }
  try {
    const event = await updateCalendarEvent(id, {
      summary:     typeof body.summary     === 'string' ? body.summary     : undefined,
      start:       typeof body.start       === 'string' ? body.start       : undefined,
      end:         typeof body.end         === 'string' ? body.end         : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      location:    typeof body.location    === 'string' ? body.location    : undefined,
      timeZone:    typeof body.timeZone    === 'string' ? body.timeZone    : 'America/Chicago',
    })
    return NextResponse.json({ ok: true, event })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
