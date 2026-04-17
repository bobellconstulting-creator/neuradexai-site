export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { callBridge, bridgeAvailable } from '@/lib/jarvis/bridge-client'
import { queueResearch } from '@/lib/jarvis/tools-fs'

interface ResearchQueueBody {
  topic?: unknown
  priority?: unknown
  notes?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ResearchQueueBody
  try {
    body = (await req.json()) as ResearchQueueBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { topic, priority, notes } = body

  // Validate topic
  if (typeof topic !== 'string' || topic.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'topic is required' }, { status: 400 })
  }
  if (topic.length > 300) {
    return NextResponse.json({ ok: false, error: 'topic must be 300 characters or fewer' }, { status: 400 })
  }

  const normalizedPriority = priority === 'high' ? 'high' : 'normal'
  const normalizedNotes = typeof notes === 'string' ? notes : undefined

  try {
    if (bridgeAvailable()) {
      const br = await callBridge('queueResearch', {
        topic: topic.trim(),
        priority: normalizedPriority,
        ...(normalizedNotes !== undefined && { notes: normalizedNotes }),
      })
      if (!br.ok) {
        return NextResponse.json({ ok: false, error: br.error ?? 'Bridge call failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, topic: topic.trim() })
    }

    // Bridge not available — call directly (local dev)
    const result = await queueResearch({
      topic: topic.trim(),
      priority: normalizedPriority,
      ...(normalizedNotes !== undefined && { notes: normalizedNotes }),
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? 'queueResearch failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, topic: topic.trim() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
