/**
 * Document extraction helpers for agent-readable file uploads.
 *
 * Agents can call pdf_extract / docx_extract via the fallback tool layer, or
 * this module can be called directly from API routes to prepare file context
 * for injection into prompts.
 *
 * All extractors return plain text (size-capped) so the result can be fed
 * straight into a system prompt or tool_result block.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_EXTRACT_CHARS = 16000

export interface ExtractedDoc {
  ok: boolean
  text?: string
  error?: string
  pages?: number
}

/**
 * Lazy-load pdf-parse so Next.js doesn't try to bundle it into the edge
 * runtime. This keeps the dep isolated to the route that actually needs it.
 */
async function loadPdfParse(): Promise<((buf: Buffer) => Promise<{ text: string; numpages: number }>) | null> {
  try {
    const mod = (await import('pdf-parse')) as unknown as {
      default: (buf: Buffer) => Promise<{ text: string; numpages: number }>
    }
    return mod.default
  } catch {
    return null
  }
}

async function loadMammoth(): Promise<
  | {
      extractRawText: (input: { buffer: Buffer } | { path: string }) => Promise<{ value: string }>
    }
  | null
> {
  try {
    const mod = (await import('mammoth')) as unknown as {
      extractRawText: (input: { buffer: Buffer } | { path: string }) => Promise<{ value: string }>
    }
    return mod
  } catch {
    return null
  }
}

export async function extractPdf(absPath: string): Promise<ExtractedDoc> {
  const parser = await loadPdfParse()
  if (!parser) return { ok: false, error: 'pdf-parse not installed' }
  try {
    const buf = await readFile(absPath)
    const result = await parser(buf)
    const text = (result.text ?? '').slice(0, MAX_EXTRACT_CHARS)
    return { ok: true, text, pages: result.numpages }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export async function extractDocx(absPath: string): Promise<ExtractedDoc> {
  const mammoth = await loadMammoth()
  if (!mammoth) return { ok: false, error: 'mammoth not installed' }
  try {
    const buf = await readFile(absPath)
    const result = await mammoth.extractRawText({ buffer: buf })
    const text = (result.value ?? '').slice(0, MAX_EXTRACT_CHARS)
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export async function extractTextFile(absPath: string): Promise<ExtractedDoc> {
  try {
    const raw = await readFile(absPath, 'utf8')
    return { ok: true, text: raw.slice(0, MAX_EXTRACT_CHARS) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

/**
 * Dispatch on file extension. Returns plain text or an error string.
 * Images and videos are not extracted here — the dispatcher routes those
 * to vision-capable models instead.
 */
export async function extractAuto(absPath: string): Promise<ExtractedDoc> {
  const ext = path.extname(absPath).toLowerCase()
  if (ext === '.pdf') return extractPdf(absPath)
  if (ext === '.docx') return extractDocx(absPath)
  if (['.txt', '.md', '.json', '.csv', '.log', '.yml', '.yaml', '.ts', '.tsx', '.js', '.jsx', '.py', '.css', '.html'].includes(ext)) {
    return extractTextFile(absPath)
  }
  return { ok: false, error: `no extractor for ${ext}` }
}

// ── Upload registry helpers ───────────────────────────────────────────────

export const UPLOADS_DIR = 'C:/Users/bobel/mission-uploads'

export function isImageExt(ext: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp'].includes(ext.toLowerCase())
}

export function isVideoExt(ext: string): boolean {
  return ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].includes(ext.toLowerCase())
}

export function isDocExt(ext: string): boolean {
  return ['.pdf', '.docx', '.txt', '.md', '.json', '.csv', '.log', '.yml', '.yaml'].includes(ext.toLowerCase())
}
