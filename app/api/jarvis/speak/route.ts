/**
 * POST /api/jarvis/speak
 * Body: { text: string, voice?: 'alan', sendToTelegram?: boolean, telegramChatId?: string, outPath?: string }
 *
 * Convenience wrapper around the `speak` tool for the Mission Control HUD
 * and any other caller that just wants "say this in JARVIS's voice" without
 * the generic /api/jarvis/tool envelope.
 *
 * Returns the same ToolResult JSON { ok, result?, error?, receipt }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { speak } from '@/lib/jarvis/tools'

export const runtime = 'nodejs'
// child_process + local file I/O must run on the Node runtime, never Edge.
export const dynamic = 'force-dynamic'

interface SpeakBody {
  text?: unknown
  voice?: unknown
  sendToTelegram?: unknown
  telegramChatId?: unknown
  outPath?: unknown
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unexpected error: ' + String(err)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SpeakBody
  try {
    body = (await req.json()) as SpeakBody
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid JSON body: ' + errorMessage(err),
        receipt: `[${new Date().toISOString()}] /api/jarvis/speak FAIL :: bad json`,
      },
      { status: 400 }
    )
  }

  if (typeof body.text !== 'string' || body.text.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing or empty "text" field',
        receipt: `[${new Date().toISOString()}] /api/jarvis/speak FAIL :: missing text`,
      },
      { status: 400 }
    )
  }

  // `speak` handles its own Zod validation — we forward the raw shape.
  const result = await speak({
    text: body.text,
    voice: body.voice,
    sendToTelegram: body.sendToTelegram,
    telegramChatId: body.telegramChatId,
    outPath: body.outPath,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
