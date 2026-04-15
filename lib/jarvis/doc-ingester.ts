/**
 * Writes extracted document content to the COG Obsidian vault and today's daily note.
 *
 * Target path: COG/05-knowledge/uploads/<slug>-<timestamp>.md
 * Daily note entry: appended via appendDaily() from vault.ts
 *
 * Writes are atomic (tmp → rename), same pattern as vault.ts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { appendDaily } from './vault'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const UPLOADS_DIR = path.join(VAULT_ROOT, '05-knowledge', 'uploads')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestedDoc {
  slug: string
  title: string
  filePath: string   // original upload temp path
  cogPath: string    // where it was written in COG vault
  wordCount: number
  method: string
  pages?: number
  ingestedAt: string
}

interface IngestParams {
  filePath: string
  originalName: string
  extractedText: string
  method: string
  pages?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.[^.]+$/, '')          // strip extension
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'upload'
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * Atomic write: stage to a .tmp file then rename.
 * Consistent with the vault.ts implementation.
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, filePath)
}

function buildNoteContent(params: {
  title: string
  slug: string
  method: string
  pages: number | undefined
  wordCount: number
  ingestedAt: string
  extractedText: string
}): string {
  const { title, slug, method, pages, wordCount, ingestedAt, extractedText } = params

  const pageLine = pages != null ? `pages: ${pages}` : 'pages: null'
  const pagesDisplay = pages != null ? ` | Pages: ${pages}` : ''

  return `---
type: upload
title: ${JSON.stringify(title)}
slug: ${slug}
source: jarvis-upload
method: ${method}
${pageLine}
wordCount: ${wordCount}
ingestedAt: ${ingestedAt}
tags: ["upload", "knowledge"]
---

# ${title}

> Uploaded via Jarvis mobile app. Extracted with ${method}.
> Words: ${wordCount}${pagesDisplay}

## Content

${extractedText}
`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function ingestDoc(
  params: IngestParams,
): Promise<{ ok: true; doc: IngestedDoc } | { ok: false; error: string }> {
  const { filePath, originalName, extractedText, method, pages } = params

  const baseSlug = slugify(originalName)
  const slug = `${baseSlug}-${Date.now()}`
  const wordCount = countWords(extractedText)
  const ingestedAt = new Date().toISOString()

  const fileName = `${slug}.md`
  const cogPath = path.join(UPLOADS_DIR, fileName)

  const content = buildNoteContent({
    title: originalName,
    slug,
    method,
    pages,
    wordCount,
    ingestedAt,
    extractedText,
  })

  try {
    await atomicWrite(cogPath, content)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to write COG note: ${msg}` }
  }

  // Append to today's daily note — best-effort, don't fail the ingestion on this
  try {
    const cogRelPath = `05-knowledge/uploads/${fileName.replace('.md', '')}`
    const dailyEntry = `- Doc ingested: [[${cogRelPath}|${originalName}]] (${wordCount.toLocaleString()} words)`
    await appendDaily(todayDate(), dailyEntry)
  } catch (err) {
    // Log only — a daily-note append failure must not abort the ingestion
    console.error('[doc-ingester] appendDaily failed:', err instanceof Error ? err.message : err)
  }

  const doc: IngestedDoc = {
    slug,
    title: originalName,
    filePath,
    cogPath,
    wordCount,
    method,
    ...(pages != null ? { pages } : {}),
    ingestedAt,
  }

  return { ok: true, doc }
}
