/**
 * POST /api/mission/broadcast
 *
 * Body: { content: string, replyTo?: string, visibility?: 'communal' | 'private' }
 *
 * Flow:
 *   1. Parse @mentions (or default to @atlas if none).
 *   2. Write Bo's message.
 *   3. Write pending agent stubs for each target.
 *   4. Return 200 immediately so the UI feels instant.
 *   5. Fire-and-forget: for each pending stub, call the real agent via
 *      agentDispatch.ts, update the row with the reply content. If the reply
 *      mentions another agent, queue a cross-talk turn (capped at MAX_HOPS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { AGENTS } from '@/lib/agents'
import {
  appendMessage,
  extractMentions,
  listMessages,
  updateMessage,
} from '@/lib/missionStream'
import { dispatchAgent, MAX_HOPS } from '@/lib/agentDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_IDS = AGENTS.map((a) => a.id)
const ROUTER_FALLBACK = 'atlas'

async function runAgentTurn(
  agentId: string,
  pendingId: string,
  hopsRemaining: number,
): Promise<void> {
  try {
    // Pull fresh full context every time so cross-talk sees prior replies
    const history = await listMessages({ limit: 100 })
    const reply = await dispatchAgent(agentId, history)

    // Agents respond with "SILENCE" when a message isn't for them
    if (reply.trim().toUpperCase() === 'SILENCE' || !reply.trim()) {
      await updateMessage(pendingId, {
        content: '',
        status: 'done',
        visibility: 'communal',
      })
      return
    }

    const newMentions = extractMentions(reply, VALID_IDS).filter((id) => id !== agentId)

    await updateMessage(pendingId, {
      content: reply,
      mentions: newMentions,
      status: 'done',
    })

    // Cross-talk: if the agent @mentioned a teammate, queue that teammate's turn
    if (hopsRemaining > 0 && newMentions.length > 0) {
      for (const targetId of newMentions) {
        const crossStub = await appendMessage({
          agentId:    targetId,
          role:       'agent',
          content:    '',
          mentions:   [],
          replyTo:    pendingId,
          status:     'pending',
          visibility: 'communal',
        })
        // Fire next hop in background (awaiting here is fine inside fire-and-forget)
        void runAgentTurn(targetId, crossStub.id, hopsRemaining - 1)
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
    replyTo?:    string
    visibility?: 'communal' | 'private'
  } | null

  const content = body?.content?.trim()
  if (!content) {
    return NextResponse.json({ ok: false, error: 'content required' }, { status: 400 })
  }

  const mentions = extractMentions(content, VALID_IDS)
  const visibility = body?.visibility ?? 'communal'

  // 1. Persist Bo's message
  const userMsg = await appendMessage({
    agentId:    'bo',
    role:       'user',
    content,
    mentions,
    replyTo:    body?.replyTo ?? null,
    status:     'done',
    visibility,
  })

  // 2. Pending stubs for every target
  const targets = mentions.length > 0 ? mentions : [ROUTER_FALLBACK]
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
      }),
    ),
  )

  // 3. Fire-and-forget real agent dispatches
  for (const stub of stubs) {
    void runAgentTurn(stub.agentId, stub.id, MAX_HOPS)
  }

  return NextResponse.json({ ok: true, user: userMsg, pending: stubs })
}
