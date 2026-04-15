/**
 * POST /api/jarvis/transcribe
 *
 * Accepts a raw audio blob (webm/mp4/wav/ogg) from the browser MediaRecorder
 * and transcribes it via Groq Whisper (whisper-large-v3-turbo).
 *
 * Body:  multipart/form-data with a single "audio" file field
 * Returns: { ok: true, transcript: string } | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GROQ_API_KEY not set' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid form data' }, { status: 400 })
  }

  const audioFile = formData.get('audio')
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'missing audio field' }, { status: 400 })
  }

  // Groq Whisper expects a file with a supported extension.
  // MediaRecorder typically produces webm or mp4 — both work fine.
  const ext = audioFile.type.includes('mp4') ? 'mp4'
    : audioFile.type.includes('ogg') ? 'ogg'
    : audioFile.type.includes('wav') ? 'wav'
    : 'webm'

  const groqForm = new FormData()
  groqForm.append('file', audioFile, `audio.${ext}`)
  groqForm.append('model', 'whisper-large-v3-turbo')
  groqForm.append('language', 'en')
  groqForm.append('response_format', 'json')

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, error: `Groq ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      )
    }

    const data = (await res.json()) as { text?: string }
    const transcript = data.text?.trim() ?? ''

    if (!transcript) {
      return NextResponse.json({ ok: false, error: 'empty transcript' }, { status: 200 })
    }

    return NextResponse.json({ ok: true, transcript })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
