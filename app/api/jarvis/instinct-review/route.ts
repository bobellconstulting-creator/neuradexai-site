export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { VAULT_PATHS, PROMOTION_THRESHOLD } from '@/lib/jarvis/vault'

const RETIRED_DIR = path.join(path.dirname(VAULT_PATHS.pending), 'retired')

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function parseFrontmatterField(raw: string, key: string): string | undefined {
  const m = raw.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m?.[1]?.trim()
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir)
    return entries.filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
}

async function moveFile(src: string, dst: string): Promise<void> {
  await fs.mkdir(path.dirname(dst), { recursive: true })
  await fs.rename(src, dst)
}

export async function GET(): Promise<NextResponse> {
  let promoted = 0
  let retired = 0
  let skipped = 0
  const now = Date.now()

  // 1. Scan pending/ — promote if confidence >= threshold AND age > 6h
  const pendingFiles = await listMdFiles(VAULT_PATHS.pending)
  for (const file of pendingFiles) {
    const src = path.join(VAULT_PATHS.pending, file)
    let raw: string
    try {
      raw = await fs.readFile(src, 'utf8')
    } catch {
      skipped++
      continue
    }

    const confidence = Number(parseFrontmatterField(raw, 'confidence') ?? '0')
    const createdAt = parseFrontmatterField(raw, 'createdAt')
    const age = createdAt ? now - new Date(createdAt).getTime() : 0

    if (confidence >= PROMOTION_THRESHOLD && age > SIX_HOURS_MS) {
      await moveFile(src, path.join(VAULT_PATHS.promoted, file))
      promoted++
    } else {
      skipped++
    }
  }

  // 2. Scan promoted/ — retire if confidence < 0.5 AND not updated in 30+ days
  const promotedFiles = await listMdFiles(VAULT_PATHS.promoted)
  for (const file of promotedFiles) {
    const src = path.join(VAULT_PATHS.promoted, file)
    let raw: string
    try {
      raw = await fs.readFile(src, 'utf8')
    } catch {
      skipped++
      continue
    }

    const confidence = Number(parseFrontmatterField(raw, 'confidence') ?? '1')
    const updatedAt = parseFrontmatterField(raw, 'updatedAt')
    const age = updatedAt ? now - new Date(updatedAt).getTime() : 0

    if (confidence < 0.5 && age > THIRTY_DAYS_MS) {
      await moveFile(src, path.join(RETIRED_DIR, file))
      retired++
    } else {
      skipped++
    }
  }

  return NextResponse.json({ ok: true, promoted, retired, skipped })
}
