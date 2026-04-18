/**
 * Speech-to-text via whisper.cpp (local, free).
 * Falls back to Groq Whisper API if local binary not found.
 *
 * Install whisper.cpp: https://github.com/ggerganov/whisper.cpp
 * Place binary at WHISPER_BIN (default: C:/Tools/whisper/main.exe)
 * Place model at WHISPER_MODEL (default: C:/Tools/whisper/models/ggml-base.en.bin)
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const WHISPER_BIN   = process.env.WHISPER_BIN   ?? 'C:/Tools/whisper/main.exe'
const WHISPER_MODEL = process.env.WHISPER_MODEL  ?? 'C:/Tools/whisper/models/ggml-base.en.bin'
const GROQ_API_KEY  = process.env.GROQ_API_KEY   ?? ''

function localWhisperAvailable(): boolean {
  return existsSync(WHISPER_BIN) && existsSync(WHISPER_MODEL)
}

export async function transcribeBuffer(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
  if (localWhisperAvailable()) {
    return transcribeLocal(audioBuffer)
  }
  if (GROQ_API_KEY) {
    return transcribeGroq(audioBuffer, mimeType)
  }
  return '[voice] No STT backend available. Install whisper.cpp or set GROQ_API_KEY.'
}

function transcribeLocal(audioBuffer: Buffer): string {
  const tmp = path.join(tmpdir(), `whisper-${Date.now()}.wav`)
  try {
    writeFileSync(tmp, audioBuffer)
    const result = spawnSync(WHISPER_BIN, ['-m', WHISPER_MODEL, '-f', tmp, '-otxt', '--no-timestamps'], {
      encoding: 'utf8',
      timeout: 30_000,
    })
    if (result.status !== 0) {
      throw new Error(result.stderr || 'whisper.cpp returned non-zero exit')
    }
    return (result.stdout ?? '').trim()
  } finally {
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }
}

async function transcribeGroq(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ab = new Uint8Array(audioBuffer).buffer
  const blob = new Blob([ab], { type: mimeType })
  const form = new FormData()
  form.append('file', blob, 'audio.ogg')
  form.append('model', 'whisper-large-v3')
  form.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq STT ${res.status}: ${err.slice(0, 200)}`)
  }
  return (await res.text()).trim()
}
