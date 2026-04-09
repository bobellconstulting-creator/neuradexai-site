/**
 * GET /api/mission/stream
 *   ?channel=office:bob    — filter to a single channel
 *   ?agent=bob             — legacy: agent's office + their own turns
 *   ?since=TS              — delta poll
 *   ?limit=N               — default 200
 */

import { NextRequest, NextResponse } from 'next/server'
import { listMessages, type ChannelId } from '@/lib/missionStream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const agentId = url.searchParams.get('agent') ?? undefined
  const channel = (url.searchParams.get('channel') ?? undefined) as ChannelId | undefined
  const sinceRaw = url.searchParams.get('since')
  const limitRaw = url.searchParams.get('limit')
  const sinceTs = sinceRaw ? Number(sinceRaw) : undefined
  const limit = limitRaw ? Number(limitRaw) : 200

  const messages = await listMessages({
    agentId,
    channel,
    sinceTs: Number.isFinite(sinceTs) ? sinceTs : undefined,
    limit: Number.isFinite(limit) ? limit : 200,
  })

  return NextResponse.json({ ok: true, messages, ts: Date.now() })
}
