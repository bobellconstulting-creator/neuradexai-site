/**
 * POST /api/mission/share
 *
 * Promote a message from its current channel into one or more target channels.
 * Creates new rows tagged with `sharedFrom` provenance. The original is never
 * modified — every share is auditable.
 *
 * Body:
 *   messageId: string                 required
 *   targets:   ChannelId[]            required — where to share it to
 *   by?:       string                 defaults to 'bo'
 */

import { NextRequest, NextResponse } from 'next/server'
import { shareMessage, type ChannelId } from '@/lib/missionStream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    messageId?: string
    targets?:   ChannelId[]
    by?:        string
  } | null

  const messageId = body?.messageId?.trim()
  const targets = body?.targets ?? []
  if (!messageId) {
    return NextResponse.json({ ok: false, error: 'messageId required' }, { status: 400 })
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ ok: false, error: 'targets required' }, { status: 400 })
  }

  const created = await shareMessage(messageId, targets, body?.by ?? 'bo')
  if (created.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'source message not found or all targets matched its current channel' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, created })
}
