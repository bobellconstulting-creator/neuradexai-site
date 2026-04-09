/**
 * GET  /api/mission/stream           — full list
 * GET  /api/mission/stream?agent=X   — filtered to that agent's turns + mentions
 * GET  /api/mission/stream?since=TS  — delta poll
 */

import { NextRequest, NextResponse } from 'next/server'
import { listMessages } from '@/lib/missionStream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const agentId = url.searchParams.get('agent') ?? undefined
  const sinceRaw = url.searchParams.get('since')
  const limitRaw = url.searchParams.get('limit')
  const sinceTs = sinceRaw ? Number(sinceRaw) : undefined
  const limit = limitRaw ? Number(limitRaw) : 200

  const messages = await listMessages({
    agentId,
    sinceTs: Number.isFinite(sinceTs) ? sinceTs : undefined,
    limit: Number.isFinite(limit) ? limit : 200,
  })

  return NextResponse.json({ ok: true, messages, ts: Date.now() })
}
