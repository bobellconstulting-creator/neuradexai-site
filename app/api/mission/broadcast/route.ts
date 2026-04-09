/**
 * POST /api/mission/broadcast
 *
 * Body:
 *   content:    string                            required
 *   channel?:   ChannelId                         explicit channel ("office:bob", "boardroom", ...)
 *   replyTo?:   string
 *   visibility?: 'communal' | 'private'
 *
 * Routing rules (when `channel` not provided):
 *   - Exactly one @mention  → office:<that agent>      (private 1:1)
 *   - Multiple @mentions    → boardroom                (public meeting)
 *   - No @mentions          → boardroom (routed through atlas)
 *
 * Side effects:
 *   1. Write Bo's message to the resolved channel.
 *   2. Create pending agent stubs in the same channel.
 *   3. Fire runAgentOnTask-style async dispatch per target.
 */

import { NextRequest, NextResponse } from 'next/server'
import { AGENTS } from '@/lib/agents'
import {
  appendMessage,
  extractMentions,
  listMessages,
  updateMessage,
  BOARDROOM,
  officeChannel,
  type ChannelId,
} from '@/lib/missionStream'
import { dispatchAgent, MAX_HOPS } from '@/lib/agentDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_IDS = AGENTS.map((a) => a.id)
const ROUTER_FALLBACK = 'atlas'

async function runAgentTurn(
  agentId: string,
  pendingId: string,
  channel: ChannelId,
  hopsRemaining: number,
): Promise<void> {
  try {
    // Scoped history — dispatcher will further scope to office+boardroom
    const history = await listMessages({ limit: 200 })
    const reply = await dispatchAgent(agentId, history)

    if (reply.trim().toUpperCase() === 'SILENCE' || !reply.trim()) {
      await updateMessage(pendingId, {
        content: '',
        status: 'done',
      })
      return
    }

    const newMentions = extractMentions(reply, VALID_IDS).filter((id) => id !== agentId)

    await updateMessage(pendingId, {
      content: reply,
      mentions: newMentions,
      status: 'done',
    })

    // Cross-talk: agent @mentioned a teammate. Default to boardroom for cross-talk
    // so Bo can see the handoff — offices stay private.
    if (hopsRemaining > 0 && newMentions.length > 0) {
      for (const targetId of newMentions) {
        const crossStub = await appendMessage({
          agentId:    targetId,
          role:       'agent',
          content:    '',
          mentions:   [],
          replyTo:    pendingId,
          status:     'pending',
          visibility: 'private',
          channel:    BOARDROOM,
        })
        void runAgentTurn(targetId, crossStub.id, BOARDROOM, hopsRemaining - 1)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'dispatch failed'
    await updateMessage(pendingId, {
      content: `⚠ ${msg}`,
      status: 'error',
    })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    content?:    string
    channel?:    ChannelId
    replyTo?:    string
    visibility?: 'communal' | 'private'
  } | null

  const content = body?.content?.trim()
  if (!content) {
    return NextResponse.json({ ok: false, error: 'content required' }, { status: 400 })
  }

  const mentions = extractMentions(content, VALID_IDS)
  const visibility = body?.visibility ?? 'private'

  // Channel routing
  let channel: ChannelId
  let targets: string[]
  if (body?.channel) {
    channel = body.channel
    // If the explicit channel is an office, the office's owner is the target
    if (channel.startsWith('office:')) {
      const owner = channel.slice('office:'.length)
      targets = mentions.length > 0 ? mentions : [owner]
    } else {
      targets = mentions.length > 0 ? mentions : [ROUTER_FALLBACK]
    }
  } else if (mentions.length === 1) {
    // Single @mention → default to that agent's private office
    channel = officeChannel(mentions[0])
    targets = mentions
  } else if (mentions.length > 1) {
    // Multi-mention → boardroom
    channel = BOARDROOM
    targets = mentions
  } else {
    // No mentions → boardroom, route to Atlas
    channel = BOARDROOM
    targets = [ROUTER_FALLBACK]
  }

  // 1. Bo's message
  const userMsg = await appendMessage({
    agentId:    'bo',
    role:       'user',
    content,
    mentions,
    replyTo:    body?.replyTo ?? null,
    status:     'done',
    visibility,
    channel,
  })

  // 2. Pending stubs per target agent
  const stubs = await Promise.all(
    targets.map((agentId) =>
      appendMessage({
        agentId,
        role:       'agent',
        content:    '',
        mentions:   [],
        replyTo:    userMsg.id,
        status:     'pending',
        visibility,
        channel,
      }),
    ),
  )

  // 3. Fire-and-forget real dispatch
  for (const stub of stubs) {
    void runAgentTurn(stub.agentId, stub.id, channel, MAX_HOPS)
  }

  return NextResponse.json({ ok: true, user: userMsg, pending: stubs, channel })
}
