/**
 * POST /api/jarvis/listen
 *
 * Speech-to-text endpoint backed by local faster-whisper. Free-first — never
 * routes through Whisper API / Azure / AWS Transcribe.
 *
 * Two input modes:
 *   1) multipart/form-data with field "audio" (a File/Blob)
 *   2) application/json with { audioUrl: string, language?: string, model?: string }
 *      → server fetches the URL, writes to a temp file, transcribes, deletes.
 *
 * Both modes write to C:/Users/bobel/tmp/jarvis-stt/<uuid>.<ext> for the
 * transcription run, then unlink the temp file (best-effort) before responding.
 *
 * Returns the same ToolResult shape as the underlying `listen` tool:
 *   { ok, result?: { text, language, durationMs, elapsedMs, confidence, ... },
 *     error?, receipt }
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { listen } from '@/lib/jarvis/tools'

export const runtime = 'nodejs'
// child_process + local file I/O — must be Node runtime, never Edge.
export const dynamic = 'force-dynamic'

const TMP_DIR = 'C:/Users/bobel/tmp/jarvis-stt'
// 25MB hard cap — Telegram voice notes top out around 1-2MB; this is generous.
const MAX_BYTES = 25 * 1024 * 1024

interface JsonBody {
  audioUrl?: unknown
  language?: unknown
  model?: unknown
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unexpected error: ' + String(err)
}

function extFromContentTypeOrUrl(ct: string | null, urlOrName: string): string {
  // Map common audio mime types → file extensions whisper/ffmpeg understand.
  const fromCt: Record<string, string> = {
    'audio/wav': '.wav',
    'audio/wave': '.wav',
    'audio/x-wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/opus': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.m4a',
    'audio/m4a': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/webm': '.webm',
    'audio/flac': '.flac',
  }
  if (ct) {
    const ctLower = ct.split(';')[0].trim().toLowerCase()
    if (fromCt[ctLower]) return fromCt[ctLower]
  }
  // Fall back to URL/filename extension.
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(urlOrName)
  if (m) return '.' + m[1].toLowerCase()
  // Default: ogg (Telegram voice notes are ogg/opus).
  return '.ogg'
}

async function writeTempFromBuffer(buf: Buffer, ext: string): Promise<string> {
  await fs.mkdir(TMP_DIR, { recursive: true })
  const safeExt = ext.startsWith('.') ? ext : '.' + ext
  const file = path.join(TMP_DIR, `${randomUUID()}${safeExt}`)
  await fs.writeFile(file, buf)
  return file
}

async function downloadToTemp(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type')
  const ab = await res.arrayBuffer()
  if (ab.byteLength > MAX_BYTES) {
    throw new Error(`audio too large: ${ab.byteLength} > ${MAX_BYTES}`)
  }
  const ext = extFromContentTypeOrUrl(ct, url)
  return writeTempFromBuffer(Buffer.from(ab), ext)
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p)
  } catch {
    // best-effort cleanup
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') || ''
  let tempPath: string | null = null
  let language: string | undefined
  let model: string | undefined

  try {
    if (contentType.includes('multipart/form-data')) {
      // ── Mode 1: multipart upload ──────────────────────────────────────────
      const form = await req.formData()
      const audio = form.get('audio')
      if (!audio || typeof audio === 'string') {
        return NextResponse.json(
          {
            ok: false,
            error: 'multipart body must include a file field named "audio"',
            receipt: `[${new Date().toISOString()}] /api/jarvis/listen FAIL :: missing audio`,
          },
          { status: 400 }
        )
      }
      const file = audio as File
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            error: `audio too large: ${file.size} > ${MAX_BYTES}`,
            receipt: `[${new Date().toISOString()}] /api/jarvis/listen FAIL :: oversize ${file.size}`,
          },
          { status: 413 }
        )
      }
      const ab = await file.arrayBuffer()
      const ext = extFromContentTypeOrUrl(file.type || null, file.name || 'audio.bin')
      tempPath = await writeTempFromBuffer(Buffer.from(ab), ext)

      const lang = form.get('language')
      if (typeof lang === 'string' && lang.length > 0) language = lang
      const mdl = form.get('model')
      if (typeof mdl === 'string' && mdl.length > 0) model = mdl
    } else {
      // ── Mode 2: JSON { audioUrl } ─────────────────────────────────────────
      let body: JsonBody
      try {
        body = (await req.json()) as JsonBody
      } catch (err: unknown) {
        return NextResponse.json(
          {
            ok: false,
            error: 'invalid JSON body: ' + errorMessage(err),
            receipt: `[${new Date().toISOString()}] /api/jarvis/listen FAIL :: bad json`,
          },
          { status: 400 }
        )
      }
      if (typeof body.audioUrl !== 'string' || body.audioUrl.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'JSON body must include "audioUrl" string. For uploads, send multipart/form-data with field "audio".',
            receipt: `[${new Date().toISOString()}] /api/jarvis/listen FAIL :: missing audioUrl`,
          },
          { status: 400 }
        )
      }
      // Allow only http(s) — reject file://, etc., to avoid SSRF on local files
      // (the listen() tool itself already requires a local path; this guards
      // the URL-fetch path specifically).
      if (!/^https?:\/\//i.test(body.audioUrl)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'audioUrl must be http(s)',
            receipt: `[${new Date().toISOString()}] /api/jarvis/listen FAIL :: bad scheme`,
          },
          { status: 400 }
        )
      }
      tempPath = await downloadToTemp(body.audioUrl)
      if (typeof body.language === 'string') language = body.language
      if (typeof body.model === 'string') model = body.model
    }

    const result = await listen({ audioPath: tempPath, language, model })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(err),
        receipt: `[${new Date().toISOString()}] /api/jarvis/listen FAIL :: ${errorMessage(err).slice(0, 120)}`,
      },
      { status: 500 }
    )
  } finally {
    if (tempPath) {
      // Cleanup the temp file regardless of success/failure.
      await safeUnlink(tempPath)
    }
  }
}
