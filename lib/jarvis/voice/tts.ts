/**
 * Text-to-speech via Piper TTS (local, free) or ElevenLabs (paid fallback).
 *
 * Install Piper: https://github.com/rhasspy/piper
 * Place binary at PIPER_BIN (default: C:/Tools/piper/piper.exe)
 * Place voice model at PIPER_VOICE (default: C:/Tools/piper/voices/en_US-ryan-high.onnx)
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const PIPER_BIN         = process.env.PIPER_BIN   ?? 'C:/Tools/piper/piper.exe'
const PIPER_VOICE       = process.env.PIPER_VOICE  ?? 'C:/Tools/piper/voices/en_US-ryan-high.onnx'
const ELEVENLABS_KEY    = process.env.ELEVENLABS_API_KEY ?? ''
const ELEVENLABS_VOICE  = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'  // Rachel (default)

function piperAvailable(): boolean {
  return existsSync(PIPER_BIN) && existsSync(PIPER_VOICE)
}

export async function synthesize(text: string): Promise<Buffer | null> {
  if (piperAvailable()) {
    return synthesizePiper(text)
  }
  if (ELEVENLABS_KEY) {
    return synthesizeElevenLabs(text)
  }
  return null
}

function synthesizePiper(text: string): Buffer | null {
  const result = spawnSync(
    PIPER_BIN,
    ['--model', PIPER_VOICE, '--output-raw'],
    {
      input: text,
      encoding: 'buffer',
      timeout: 15_000,
    },
  )
  if (result.status !== 0) {
    console.error('[tts] piper failed:', result.stderr?.toString().slice(0, 200))
    return null
  }
  return result.stdout as Buffer
}

async function synthesizeElevenLabs(text: string): Promise<Buffer | null> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2' }),
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!res.ok) {
    console.error('[tts] ElevenLabs failed:', res.status)
    return null
  }
  return Buffer.from(await res.arrayBuffer())
}
