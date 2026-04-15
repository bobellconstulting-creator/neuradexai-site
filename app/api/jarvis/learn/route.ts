/**
 * POST /api/jarvis/learn
 *
 * Trigger Jarvis to research a topic and permanently store knowledge in COG.
 * Designed to be called from the mobile UI or any HTTP client.
 *
 * Body: { topic: string, count?: number, depth?: 'surface' | 'deep' }
 *
 * Free-first: uses Tavily (search) + Gemini 2.5 Flash (synthesis).
 * No paid APIs wired.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { learnTopic } from '@/lib/jarvis/tools-learning'

export const runtime = 'nodejs'

const LearnRequestSchema = z.object({
  topic: z.string().min(1).max(200),
  count: z.number().int().min(1).max(100).optional(),
  depth: z.enum(['surface', 'deep']).optional(),
})

export async function POST(request: NextRequest) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid JSON body', code: 'PARSE_ERROR' },
      { status: 400 },
    )
  }

  const parsed = LearnRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'invalid body', code: 'VALIDATION_FAILED', issues: parsed.error.format() },
      { status: 400 },
    )
  }

  const toolResult = await learnTopic(parsed.data)

  if (!toolResult.ok) {
    return NextResponse.json(
      { success: false, error: toolResult.error ?? 'learnTopic failed', code: 'LEARN_FAILED', receipt: toolResult.receipt },
      { status: 502 },
    )
  }

  return NextResponse.json({
    success: true,
    ...toolResult.result,
    receipt: toolResult.receipt,
  })
}
