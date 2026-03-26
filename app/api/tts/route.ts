import { NextRequest, NextResponse } from 'next/server'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? ''
// Adam voice — deep, authoritative, Jarvis-style
const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'

export async function POST(req: NextRequest) {
  const { text } = await req.json() as { text?: string }
  if (!text?.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 })
  if (!ELEVENLABS_API_KEY) return NextResponse.json({ error: 'No ElevenLabs key' }, { status: 500 })

  const clean = text.replace(/[*_`#>]/g, '').replace(/⚠/g, 'Warning:').slice(0, 500)

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: clean,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const audio = await res.arrayBuffer()
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
