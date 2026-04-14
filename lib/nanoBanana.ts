/**
 * Nano Banana 2 — Google Gemini 3.1 Flash Image Preview wrapper.
 *
 * Thin, server-side only. Calls the generateContent endpoint with
 * responseModalities: ["Image"], decodes the base64 payload, writes
 * it to public/generated/<uuid>.png, and returns the public URL so
 * the caller can render it with <img src=...>.
 *
 * Env: GOOGLE_API_KEY (shared with lib/agentDispatch.ts)
 */

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ??
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
  ''

const MODEL = 'gemini-3.1-flash-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'
export type ImageResolution = '1K' | '2K' | '4K'

export interface GenerateImageOptions {
  prompt: string
  aspectRatio?: AspectRatio
  resolution?: ImageResolution
}

export interface GenerateImageResult {
  ok: boolean
  mimeType?: string
  base64?: string
  savedPath?: string
  publicUrl?: string
  error?: string
}

interface GeminiInlineData {
  mime_type?: string
  mimeType?: string
  data?: string
}

interface GeminiPart {
  text?: string
  inline_data?: GeminiInlineData
  inlineData?: GeminiInlineData
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
  }>
  error?: { message?: string; code?: number; status?: string }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : 'unknown error'
}

export async function generateImage(
  opts: GenerateImageOptions,
): Promise<GenerateImageResult> {
  if (!GOOGLE_API_KEY) {
    return { ok: false, error: 'GOOGLE_API_KEY not configured' }
  }
  if (!opts.prompt || !opts.prompt.trim()) {
    return { ok: false, error: 'prompt is required' }
  }

  const aspectRatio: AspectRatio = opts.aspectRatio ?? '16:9'

  const body = {
    contents: [{ parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseModalities: ['Image'],
      imageConfig: {
        aspectRatio,
        ...(opts.resolution ? { resolution: opts.resolution } : {}),
      },
    },
  }

  let res: Response
  try {
    res = await fetch(`${ENDPOINT}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err: unknown) {
    return { ok: false, error: `network: ${errorMessage(err)}` }
  }

  let data: GeminiResponse | null = null
  try {
    data = (await res.json()) as GeminiResponse
  } catch {
    return { ok: false, error: `bad response (${res.status})` }
  }

  if (!res.ok) {
    const apiMsg = data?.error?.message ?? `status ${res.status}`
    if (res.status === 429) return { ok: false, error: `rate limited: ${apiMsg}` }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `auth: ${apiMsg}` }
    }
    return { ok: false, error: apiMsg }
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? []
  let mimeType: string | undefined
  let base64: string | undefined
  for (const p of parts) {
    const inline = p.inline_data ?? p.inlineData
    if (inline?.data) {
      mimeType = inline.mime_type ?? inline.mimeType ?? 'image/png'
      base64 = inline.data
      break
    }
  }

  if (!base64) {
    return { ok: false, error: 'no image in response' }
  }

  try {
    const outDir = path.join(process.cwd(), 'public', 'generated')
    await mkdir(outDir, { recursive: true })
    const ext = mimeType?.includes('jpeg') ? 'jpg' : 'png'
    const fileName = `${randomUUID()}.${ext}`
    const savedPath = path.join(outDir, fileName)
    await writeFile(savedPath, Buffer.from(base64, 'base64'))
    return {
      ok: true,
      mimeType,
      base64,
      savedPath,
      publicUrl: `/generated/${fileName}`,
    }
  } catch (err: unknown) {
    return { ok: false, error: `write failed: ${errorMessage(err)}` }
  }
}
