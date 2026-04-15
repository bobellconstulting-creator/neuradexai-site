/**
 * Text extraction from uploaded files for Jarvis document ingestion.
 *
 * Supported methods:
 *   pdf-parse    — PDF files
 *   mammoth      — DOCX files
 *   plaintext    — .txt, .md, .csv, .json, .yaml, .yml, .log
 *   gemini-vision — images (.jpg, .jpeg, .png, .gif, .webp)
 *   unknown      — unsupported types (returns ok: false)
 *
 * Free-first: image OCR uses Gemini 2.5 Flash, no paid APIs.
 * Text is capped at 100,000 characters; truncation is noted in the output.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const TEXT_CAP = 100_000

export type ExtractionMethod = 'pdf-parse' | 'mammoth' | 'plaintext' | 'gemini-vision' | 'unknown'

export interface ExtractionResult {
  ok: boolean
  text: string
  method: ExtractionMethod
  pages?: number
  truncated?: boolean
  error?: string
}

// ─── Extension sets ────────────────────────────────────────────────────────────

const PLAIN_TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.log'])
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= TEXT_CAP) return { text, truncated: false }
  return {
    text: text.slice(0, TEXT_CAP) + '\n\n[--- Content truncated at 100,000 characters ---]',
    truncated: true,
  }
}

/** Safely extract the text part from Gemini's nested response envelope. */
function extractGeminiText(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  const candidates = d['candidates']
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const first = candidates[0]
  if (typeof first !== 'object' || first === null) return null
  const content = (first as Record<string, unknown>)['content']
  if (typeof content !== 'object' || content === null) return null
  const parts = (content as Record<string, unknown>)['parts']
  if (!Array.isArray(parts) || parts.length === 0) return null
  const part = parts[0]
  if (typeof part !== 'object' || part === null) return null
  const text = (part as Record<string, unknown>)['text']
  return typeof text === 'string' ? text : null
}

// ─── Extraction strategies ────────────────────────────────────────────────────

async function extractPdf(filePath: string): Promise<ExtractionResult> {
  // pdf-parse v2 uses a class-based API: new PDFParse({ data }) → .getText()
  const { PDFParse } = await import('pdf-parse')
  const buf = await fs.readFile(filePath)
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  const result = await parser.getText()
  const { text, truncated } = capText(result.text ?? '')
  // result.total is the page count in v2
  const pages = (result as unknown as Record<string, unknown>)['total'] as number | undefined
  await parser.destroy()
  return { ok: true, text, method: 'pdf-parse', pages, truncated }
}

async function extractDocx(filePath: string): Promise<ExtractionResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ path: filePath })
  const { text, truncated } = capText(result.value ?? '')
  return { ok: true, text, method: 'mammoth', truncated }
}

async function extractPlainText(filePath: string): Promise<ExtractionResult> {
  const raw = await fs.readFile(filePath, 'utf8')
  const { text, truncated } = capText(raw)
  return { ok: true, text, method: 'plaintext', truncated }
}

async function extractImage(filePath: string, ext: string): Promise<ExtractionResult> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return { ok: false, text: '', method: 'gemini-vision', error: 'GOOGLE_API_KEY not set' }
  }

  const buf = await fs.readFile(filePath)
  const base64 = buf.toString('base64')

  // Map extension to MIME type
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  const mimeType = mimeMap[ext] ?? 'image/jpeg'

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: 'Extract all text and meaningful content from this image. Return the raw text only, no commentary.',
            },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    return { ok: false, text: '', method: 'gemini-vision', error: `Gemini HTTP ${res.status}: ${body}` }
  }

  const data: unknown = await res.json()
  const extracted = extractGeminiText(data)
  if (!extracted) {
    return { ok: false, text: '', method: 'gemini-vision', error: 'Gemini returned no text' }
  }

  const { text, truncated } = capText(extracted)
  return { ok: true, text, method: 'gemini-vision', truncated }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extracts readable text from a file at the given path.
 * Dispatch is based solely on file extension — no MIME sniffing.
 */
export async function extractText(filePath: string): Promise<ExtractionResult> {
  const ext = path.extname(filePath).toLowerCase()

  try {
    if (ext === '.pdf') return await extractPdf(filePath)
    if (ext === '.docx') return await extractDocx(filePath)
    if (PLAIN_TEXT_EXTS.has(ext)) return await extractPlainText(filePath)
    if (IMAGE_EXTS.has(ext)) return await extractImage(filePath, ext)
    return { ok: false, text: '', method: 'unknown', error: `Unsupported file type: ${ext}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Determine which method was attempted for the error record
    let method: ExtractionMethod = 'unknown'
    if (ext === '.pdf') method = 'pdf-parse'
    else if (ext === '.docx') method = 'mammoth'
    else if (PLAIN_TEXT_EXTS.has(ext)) method = 'plaintext'
    else if (IMAGE_EXTS.has(ext)) method = 'gemini-vision'
    return { ok: false, text: '', method, error: msg }
  }
}

/** Returns true if the file extension is supported by extractText. */
export function isSupportedExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return (
    ext === '.pdf' ||
    ext === '.docx' ||
    PLAIN_TEXT_EXTS.has(ext) ||
    IMAGE_EXTS.has(ext)
  )
}
