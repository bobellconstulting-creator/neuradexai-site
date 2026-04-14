/**
 * POST /api/mission/upload
 *
 * Multipart/form-data upload endpoint for Mission Control's FileDropzone.
 * Accepts up to 10 files, 50 MB each, and saves them to
 * C:/Users/bobel/mission-uploads/<YYYY-MM-DD>/<unix_ms>-<sanitized_name>.
 *
 * Response shape matches `UploadRecord` used by the useMissionUploads hook
 * and the /api/mission/files list route.
 *
 * Security:
 *   - guardApiRoute(req, {skipBody:true}) — loopback, rate-limit; we skip the
 *     16 KB body check because multipart payloads of 50 MB are expected.
 *   - Per-file size cap enforced below (MAX_FILE_BYTES).
 *   - Filename strictly sanitized before touching disk.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { guardApiRoute } from '@/lib/apiGuard'

export const runtime = 'nodejs'

// ─── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_ROOT = 'C:/Users/bobel/mission-uploads'
const MAX_FILES = 10
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB
const MAX_NAME_LEN = 120

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'])
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'])
const DOC_EXTS = new Set(['pdf', 'docx', 'txt', 'md', 'json', 'csv', 'log', 'yml', 'yaml'])

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadKind = 'image' | 'video' | 'doc' | 'other'

export interface UploadRecord {
  id: string
  name: string
  originalName: string
  size: number
  kind: UploadKind
  url: string
  uploadedAt: number
  absPath: string
}

interface UploadResponse {
  success: boolean
  uploads: UploadRecord[]
  error?: string
}

// ─── Validation ───────────────────────────────────────────────────────────────

// Zod validates the shape of per-file metadata we derive from each FormDataEntryValue.
// We cannot validate the File contents themselves through Zod, but we validate
// everything around it (name, size, type).
const fileMetaSchema = z.object({
  name: z.string().min(1).max(512),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_FILE_BYTES, `File exceeds max size of ${MAX_FILE_BYTES} bytes`),
  type: z.string().max(256).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeName(input: string): string {
  // Drop any directory components first.
  const base = input.split(/[\\/]/).pop() ?? 'file'
  // Keep only safe characters; replace the rest with '_'.
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Guard against empty / dotfile-only names.
  const normalized = safe.replace(/^\.+/, '') || 'file'
  return normalized.slice(0, MAX_NAME_LEN)
}

function kindFromName(name: string): UploadKind {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (DOC_EXTS.has(ext)) return 'doc'
  return 'other'
}

function todayDateDir(): string {
  const now = new Date()
  const yyyy = now.getFullYear().toString().padStart(4, '0')
  const mm = (now.getMonth() + 1).toString().padStart(2, '0')
  const dd = now.getDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function randomSuffix(len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<UploadResponse>> {
  const blocked = await guardApiRoute(req, { skipBody: true })
  if (blocked) {
    // guardApiRoute returns NextResponse<unknown>; coerce to the expected type.
    return blocked as NextResponse<UploadResponse>
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch (err: unknown) {
    return NextResponse.json<UploadResponse>(
      { success: false, uploads: [], error: `Invalid multipart body: ${errorMessage(err)}` },
      { status: 400 },
    )
  }

  // Collect entries that look like files. Accept both 'files' (repeated) and
  // 'file' keys for flexibility.
  const rawFiles: File[] = []
  for (const [, value] of form.entries()) {
    if (value instanceof File) {
      rawFiles.push(value)
    }
  }

  if (rawFiles.length === 0) {
    return NextResponse.json<UploadResponse>(
      { success: false, uploads: [], error: 'No files provided' },
      { status: 400 },
    )
  }

  if (rawFiles.length > MAX_FILES) {
    return NextResponse.json<UploadResponse>(
      { success: false, uploads: [], error: `Too many files (max ${MAX_FILES})` },
      { status: 400 },
    )
  }

  // Validate each file's metadata via Zod before touching disk.
  for (const f of rawFiles) {
    const parsed = fileMetaSchema.safeParse({
      name: f.name,
      size: f.size,
      type: f.type,
    })
    if (!parsed.success) {
      return NextResponse.json<UploadResponse>(
        {
          success: false,
          uploads: [],
          error: `Invalid file "${f.name}": ${parsed.error.issues[0]?.message ?? 'validation failed'}`,
        },
        { status: 400 },
      )
    }
  }

  const dateDir = todayDateDir()
  const targetDir = path.join(UPLOAD_ROOT, dateDir)

  try {
    await mkdir(targetDir, { recursive: true })
  } catch (err: unknown) {
    return NextResponse.json<UploadResponse>(
      { success: false, uploads: [], error: `Failed to create upload dir: ${errorMessage(err)}` },
      { status: 500 },
    )
  }

  const uploads: UploadRecord[] = []

  for (const file of rawFiles) {
    const originalName = file.name
    const sanitized = sanitizeName(originalName)
    const ts = Date.now()
    const storedName = `${ts}-${sanitized}`
    const absPath = path.join(targetDir, storedName)

    try {
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.byteLength > MAX_FILE_BYTES) {
        return NextResponse.json<UploadResponse>(
          {
            success: false,
            uploads: [],
            error: `File "${originalName}" exceeds max size of ${MAX_FILE_BYTES} bytes`,
          },
          { status: 413 },
        )
      }
      await writeFile(absPath, bytes)
    } catch (err: unknown) {
      return NextResponse.json<UploadResponse>(
        {
          success: false,
          uploads: [],
          error: `Failed to save "${originalName}": ${errorMessage(err)}`,
        },
        { status: 500 },
      )
    }

    const record: UploadRecord = {
      id: `${ts}_${randomSuffix(6)}`,
      name: storedName,
      originalName,
      size: file.size,
      kind: kindFromName(originalName),
      url: `/api/mission/files/${encodeURIComponent(storedName)}?d=${encodeURIComponent(dateDir)}`,
      uploadedAt: ts,
      absPath: absPath.replace(/\\/g, '/'),
    }
    uploads.push(record)
  }

  return NextResponse.json<UploadResponse>({ success: true, uploads })
}
