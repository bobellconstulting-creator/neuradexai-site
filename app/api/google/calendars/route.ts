import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/google/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const token = await getAccessToken()
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json() as { items?: Array<{ id: string; summary: string; primary?: boolean; accessRole: string }> }
    const calendars = (data.items ?? []).map(c => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary ?? false,
      accessRole: c.accessRole,
    }))
    return NextResponse.json({ ok: true, calendars })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
