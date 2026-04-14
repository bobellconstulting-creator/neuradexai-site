/**
 * GET /api/mission/files/[filename]?d=<YYYY-MM-DD>
 *
 * Serves a single uploaded file from C:/Users/bobel/mission-uploads/<d>/<filename>.
 * Used by Mission Control's FileDropzone to render image thumbnails.
 *
 * Hardening:
 *   - Rejects any filename/date param containing '..' or a path separator.
 *   - Only accepts YYYY-MM-DD date params.
 *   - Reads the file via path.join under the fixed upload root.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { guardApiRoute } from '@/lib/apiGuard'

export const runtime = 'nodejs'

// ─── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_ROOT = 'C:/Users/bobel/mission-uploads'
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Content-Type map ─────────────────────────────────────────────────────────

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  // images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  // videos
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4v: 'video/x-m4v',
  // docs
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
}

function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

function hasBadChars(s: string): boolean {
  if (s.includes('..')) return true
  if (s.includes('/') || s.includes('\\')) return true
  if (s.includes('\0')) return true
  return false
}

// ─── Route handler ────────────────────────────────────────────────────────────

interface RouteContext {
  params: { filename: string }
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked

  const filenameRaw = context.params.filename
  const filename = decodeURIComponent(filenameRaw)
  const dateParam = req.nextUrl.searchParams.get('d') ?? ''

  if (!filename || hasBadChars(filename)) {
    return NextResponse.json(
      { success: false, error: 'Invalid filename' },
      { status: 400 },
    )
  }

  if (!DATE_DIR_RE.test(dateParam)) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing date param ?d=YYYY-MM-DD' },
      { status: 400 },
    )
  }

  const absPath = path.join(UPLOAD_ROOT, dateParam, filename)

  // Defense in depth: make sure the resolved path is still inside UPLOAD_ROOT.
  const resolvedRoot = path.resolve(UPLOAD_ROOT)
  const resolvedFile = path.resolve(absPath)
  if (!resolvedFile.startsWith(resolvedRoot)) {
    return NextResponse.json(
      { success: false, error: 'Path traversal blocked' },
      { status: 400 },
    )
  }

  try {
    const st = await stat(resolvedFile)
    if (!st.isFile()) {
      return NextResponse.json({ success: false, error: 'Not a file' }, { status: 404 })
    }
    const bytes = await readFile(resolvedFile)
    // Copy into a plain Uint8Array so BodyInit is satisfied cleanly.
    const body = new Uint8Array(bytes.byteLength)
    body.set(bytes)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(filename),
        'Content-Length': String(st.size),
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 })
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: `Failed to read file: ${message}` },
      { status: 500 },
    )
  }
}
