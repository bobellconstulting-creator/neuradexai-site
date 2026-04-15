/**
 * POST /api/jarvis/upload
 *
 * Accepts a multipart/form-data request with a single "file" field.
 * Extracts text from the file and writes a structured note to the COG vault.
 *
 * Max size: 50 MB
 * Allowed types: pdf, docx, txt, md, csv, json, yaml, yml, jpg, jpeg, png, gif, webp
 *
 * Returns:
 *   200  { ok: true,  doc: IngestedDoc, confirmation: string }
 *   400  { ok: false, error: string }   — validation failure
 *   415  { ok: false, error: string }   — unsupported file type
 *   500  { ok: false, error: string }   — extraction or ingestion failure
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { extractText } from '@/lib/jarvis/doc-extractor'
import { ingestDoc } from '@/lib/jarvis/doc-ingester'

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx',
  '.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.log',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
])

const TEMP_DIR = 'C:/Users/bobel/tmp/jarvis-uploads'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase()
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status })
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorResponse('Failed to parse multipart form data', 400)
  }

  const fileField = formData.get('file')
  if (!(fileField instanceof File)) {
    return errorResponse('Missing required field: "file"', 400)
  }

  const file = fileField

  // 2. Validate size
  if (file.size > MAX_SIZE_BYTES) {
    return errorResponse(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 50 MB)`,
      400,
    )
  }

  // 3. Validate extension
  const ext = getExtension(file.name)
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return errorResponse(
      `Unsupported file type: "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      415,
    )
  }

  // 4. Write to temp file
  let tempPath: string
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true })
    tempPath = path.join(TEMP_DIR, `${randomUUID()}${ext}`)
    const arrayBuffer = await file.arrayBuffer()
    await fs.writeFile(tempPath, Buffer.from(arrayBuffer))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return errorResponse(`Failed to save temp file: ${msg}`, 500)
  }

  // 5. Extract text
  const extraction = await extractText(tempPath)

  // Best-effort temp cleanup — fire and forget, never block response
  fs.unlink(tempPath).catch(() => undefined)

  if (!extraction.ok) {
    if (extraction.method === 'unknown') {
      return errorResponse(`Unsupported file type: "${ext}"`, 415)
    }
    return errorResponse(`Text extraction failed: ${extraction.error ?? 'unknown error'}`, 500)
  }

  // 6. Ingest into COG vault
  const ingestion = await ingestDoc({
    filePath: tempPath,
    originalName: file.name,
    extractedText: extraction.text,
    method: extraction.method,
    pages: extraction.pages,
  })

  if (!ingestion.ok) {
    return errorResponse(`Ingestion failed: ${ingestion.error}`, 500)
  }

  const { doc } = ingestion
  const wordDisplay = doc.wordCount.toLocaleString()
  const confirmation = `Filed under knowledge, sir. ${wordDisplay} words from ${file.name}.`

  return NextResponse.json({ ok: true, doc, confirmation }, { status: 200 })
}
