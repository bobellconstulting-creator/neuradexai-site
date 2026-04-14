/**
 * GET /api/mission/files
 *
 * Returns the last 50 Mission Control uploads across all date subdirs
 * under C:/Users/bobel/mission-uploads/, newest first by mtime.
 *
 * Response shape mirrors UploadRecord used by /api/mission/upload and the
 * useMissionUploads client hook — same field names, same order.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { guardApiRoute } from '@/lib/apiGuard'

export const runtime = 'nodejs'

// ─── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_ROOT = 'C:/Users/bobel/mission-uploads'
const MAX_RESULTS = 50

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'])
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'])
const DOC_EXTS = new Set(['pdf', 'docx', 'txt', 'md', 'json', 'csv', 'log', 'yml', 'yaml'])

// Matches YYYY-MM-DD exactly — nothing else counts as a date subdir.
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/

// Matches the stored-name convention <unix_ms>-<sanitized>.
const STORED_NAME_RE = /^(\d+)-(.+)$/

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

interface ListResponse {
  success: boolean
  uploads: UploadRecord[]
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kindFromName(name: string): UploadKind {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (DOC_EXTS.has(ext)) return 'doc'
  return 'other'
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

function randomSuffix(len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

interface RawEntry {
  dateDir: string
  fileName: string
  absPath: string
  size: number
  mtimeMs: number
}

async function readDateDir(dateDir: string): Promise<RawEntry[]> {
  const dirPath = path.join(UPLOAD_ROOT, dateDir)
  let names: string[]
  try {
    names = await readdir(dirPath)
  } catch {
    return []
  }

  const out: RawEntry[] = []
  for (const name of names) {
    const absPath = path.join(dirPath, name)
    try {
      const st = await stat(absPath)
      if (!st.isFile()) continue
      out.push({
        dateDir,
        fileName: name,
        absPath,
        size: st.size,
        mtimeMs: st.mtimeMs,
      })
    } catch {
      // Skip unreadable entries rather than fail the whole listing.
    }
  }
  return out
}

function toRecord(entry: RawEntry): UploadRecord {
  // Recover original name + unix_ms from the stored convention.
  const match = STORED_NAME_RE.exec(entry.fileName)
  const uploadedAt = match ? Number(match[1]) : Math.floor(entry.mtimeMs)
  const originalName = match ? match[2] : entry.fileName

  return {
    id: `${uploadedAt}_${randomSuffix(6)}`,
    name: entry.fileName,
    originalName,
    size: entry.size,
    kind: kindFromName(originalName),
    url: `/api/mission/files/${encodeURIComponent(entry.fileName)}?d=${encodeURIComponent(entry.dateDir)}`,
    uploadedAt,
    absPath: entry.absPath.replace(/\\/g, '/'),
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse<ListResponse>> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked as NextResponse<ListResponse>

  let dateDirs: string[]
  try {
    const entries = await readdir(UPLOAD_ROOT, { withFileTypes: true })
    dateDirs = entries
      .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse() // newest date first
  } catch (err: unknown) {
    // Upload root doesn't exist yet — return empty list, not an error.
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json<ListResponse>({ success: true, uploads: [] })
    }
    return NextResponse.json<ListResponse>(
      { success: false, uploads: [], error: `Failed to read upload root: ${errorMessage(err)}` },
      { status: 500 },
    )
  }

  const raw: RawEntry[] = []
  for (const d of dateDirs) {
    const entries = await readDateDir(d)
    raw.push(...entries)
    // Early bail-out: we only need the newest 50, and date dirs are already
    // walked newest-first, so once we have well above the cap we can stop.
    if (raw.length >= MAX_RESULTS * 4) break
  }

  raw.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const capped = raw.slice(0, MAX_RESULTS)
  const uploads = capped.map(toRecord)

  return NextResponse.json<ListResponse>({ success: true, uploads })
}
