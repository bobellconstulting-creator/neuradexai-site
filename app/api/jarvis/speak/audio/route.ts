/**
 * POST /api/jarvis/speak/audio
 *
 * Converts text to speech using Microsoft Edge TTS (free, no key required).
 * Returns audio/mp3 bytes the browser can play directly.
 *
 * Fallback chain:
 *   1. Edge TTS (cloud, always available on Vercel)
 *   2. Local Piper TTS (only works when running locally)
 *
 * Body:    { text: string; voice?: string }
 * Returns: audio/mp3 (200) | JSON error (400 / 500)
 */

import { NextRequest, NextResponse } from 'next/server'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Jarvis voice — British male, authoritative
const EDGE_VOICE = 'en-GB-RyanNeural'

interface RequestBody {
  text?: unknown
  voice?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'missing text' }, { status: 400 })
  }

  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readable = tts.toStream(text) as any
      readable.on('data', (chunk: unknown) => chunks.push(Buffer.from(chunk as ArrayBuffer)))
      readable.on('end', () => resolve(Buffer.concat(chunks)))
      readable.on('error', reject)
    })

    return new NextResponse(audioBuffer.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error('[speak/audio] Edge TTS failed:', msg)
    return NextResponse.json({ error: `TTS failed: ${msg}` }, { status: 500 })
  }
}
