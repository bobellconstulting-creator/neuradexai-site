/**
 * GET /api/jarvis/system-prompt
 *
 * Returns the fully-assembled Jarvis system prompt (SOUL + vault memory) as
 * plain text. Primarily used for smoke-testing the context-injector pipeline.
 * 60-second Cache-Control so a repeat curl doesn't burn cold reads.
 */

import { NextResponse } from 'next/server'
import { buildJarvisSystemPrompt } from '@/lib/jarvis/context-injector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const prompt = await buildJarvisSystemPrompt()
    return new NextResponse(prompt, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
