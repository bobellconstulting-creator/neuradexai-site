/**
 * Obsidian vault writer for Jarvis evolved-learner brain.
 *
 * Targets the canonical brain at C:/Users/bobel/COG/. All writes are:
 *   - Atomic (write to .tmp, then rename)
 *   - Idempotent (content hash dedupe — same input never duplicates)
 *   - Append/merge oriented (never blind overwrite)
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  type ProfileDelta,
  type CognitivePattern,
  type Instinct,
  type PersistedInstinct,
  PersistedInstinctSchema,
} from './types'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'

const DAILY_DIR = path.join(VAULT_ROOT, '01-daily')
const PEOPLE_DIR = path.join(VAULT_ROOT, '06-people')
const BO_FILE = path.join(PEOPLE_DIR, 'bo.md')
const INSTINCTS_DIR = path.join(VAULT_ROOT, '05-knowledge', 'instincts')
const PROMOTED_DIR = path.join(INSTINCTS_DIR, 'promoted')
const PENDING_DIR = path.join(INSTINCTS_DIR, 'pending')

// Confidence threshold for promoting an instinct from pending → promoted.
// Bo's spec: ≥ 0.6 = promoted. Below = pending (review later).
export const PROMOTION_THRESHOLD = 0.6

// ─── Filesystem helpers ────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Atomic write: stage to .tmp in same dir, then rename. Rename is atomic on
 * the same filesystem on both Windows and POSIX.
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, filePath)
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

function nowIso(): string {
  return new Date().toISOString()
}

// ─── Daily notes ───────────────────────────────────────────────────────────

const DAILY_FRONTMATTER = (date: string) => `---
date: ${date}
type: daily
source: jarvis-reflector
---

# ${date}

`

/**
 * Append `entry` to today's (or specified) daily note. Creates the file with
 * frontmatter if it doesn't exist. Each entry is content-hash-deduped: writing
 * the same entry twice for the same day is a no-op.
 */
export async function appendDaily(date: string, entry: string): Promise<void> {
  const safeDate = date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error(`appendDaily: date must be YYYY-MM-DD, got "${date}"`)
  }
  const trimmedEntry = entry.trim()
  if (!trimmedEntry) return

  const file = path.join(DAILY_DIR, `${safeDate}.md`)
  const existing = (await readIfExists(file)) ?? DAILY_FRONTMATTER(safeDate)

  const hash = shortHash(trimmedEntry)
  const marker = `<!-- entry:${hash} -->`
  if (existing.includes(marker)) return // idempotent: already present

  const stamp = new Date().toISOString().slice(11, 19) // HH:MM:SS
  const block = `\n## ${stamp}\n${marker}\n${trimmedEntry}\n`
  await atomicWrite(file, existing + block)
}

// ─── Bo profile ────────────────────────────────────────────────────────────

const BO_FRONTMATTER = `---
type: person
name: Bo Bell
source: jarvis-reflector
---

# Bo Bell

`

/**
 * Merge ProfileDeltas into bo.md. Each delta is appended as a bullet under a
 * "## <field>" section and content-hash-deduped so re-running with the same
 * input is a no-op.
 */
export async function updateBoProfile(deltas: ProfileDelta[]): Promise<void> {
  if (deltas.length === 0) return

  const existing = (await readIfExists(BO_FILE)) ?? BO_FRONTMATTER
  let next = existing

  for (const delta of deltas) {
    const field = delta.field.trim()
    const value = delta.value.trim()
    if (!field || !value) continue

    const hash = shortHash(`${field}::${value}`)
    const marker = `<!-- fact:${hash} -->`
    if (next.includes(marker)) continue // dedupe

    const sectionHeader = `## ${field}`
    const bullet = `- ${marker} ${value} _(confidence ${delta.confidence.toFixed(2)})_`

    if (next.includes(sectionHeader)) {
      // Append bullet under existing section.
      const sectionRegex = new RegExp(
        `(##\\s+${field.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\n(?:[^#]*\\n)*)`,
        'i',
      )
      next = next.replace(sectionRegex, (match) => `${match}${bullet}\n`)
    } else {
      // Create new section.
      next += `\n${sectionHeader}\n${bullet}\n`
    }
  }

  if (next !== existing) {
    await atomicWrite(BO_FILE, next)
  }
}

// ─── Cognitive patterns ────────────────────────────────────────────────────

const COGNITIVE_SECTION = '## Cognitive Patterns'

/**
 * Merge CognitivePatterns into the dedicated section of bo.md.
 *
 * Format per entry:
 *   - <!-- pattern:<hash> --> **<pattern>** (conf <confidence>) — _<evidence>_
 *
 * Content-hash deduped on pattern text: identical pattern = no-op.
 * Atomic write same as updateBoProfile.
 */
export async function updateCognitivePatterns(patterns: CognitivePattern[]): Promise<void> {
  if (patterns.length === 0) return

  const existing = (await readIfExists(BO_FILE)) ?? BO_FRONTMATTER
  let next = existing

  for (const cp of patterns) {
    const pattern = cp.pattern.trim()
    const evidence = cp.evidence.trim()
    if (!pattern || !evidence) continue

    // Dedupe on pattern text only — same pattern, different evidence = no-op
    // so we don't overwrite a higher-confidence entry with a weaker one.
    const hash = shortHash(`cognitive::${pattern}`)
    const marker = `<!-- pattern:${hash} -->`
    if (next.includes(marker)) continue

    const bullet =
      `- ${marker} **${pattern}** (conf ${cp.confidence.toFixed(2)}) — _${evidence}_`

    if (next.includes(COGNITIVE_SECTION)) {
      // Append bullet under existing section.
      const escaped = COGNITIVE_SECTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sectionRegex = new RegExp(`(${escaped}\\s*\\n(?:[^#]*\\n)*)`, 'i')
      next = next.replace(sectionRegex, (match) => `${match}${bullet}\n`)
    } else {
      // Create section at end of file.
      next += `\n${COGNITIVE_SECTION}\n${bullet}\n`
    }
  }

  if (next !== existing) {
    await atomicWrite(BO_FILE, next)
  }
}

// ─── Instincts ─────────────────────────────────────────────────────────────

function instinctMarkdown(instinct: PersistedInstinct): string {
  return `---
kind: ${instinct.kind}
title: ${JSON.stringify(instinct.title)}
confidence: ${instinct.confidence}
hash: ${instinct.hash}
promoted: ${instinct.promoted}
source: ${JSON.stringify(instinct.source ?? 'reflection')}
createdAt: ${instinct.createdAt}
updatedAt: ${instinct.updatedAt}
---

# ${instinct.title}

${instinct.body}
`
}

function parseInstinctFrontmatter(raw: string): PersistedInstinct | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) return null
  const fm = fmMatch[1]
  const rest = fmMatch[2]

  const get = (key: string): string | undefined => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    return m?.[1]?.trim()
  }

  const unquote = (v: string | undefined): string => {
    if (!v) return ''
    try {
      if (v.startsWith('"')) return JSON.parse(v) as string
    } catch {
      /* fall through */
    }
    return v
  }

  const titleLine = get('title')
  const title = unquote(titleLine)
  const body = rest.replace(/^#\s.*\n/, '').trim()

  const candidate = {
    kind: get('kind') ?? 'preference',
    title,
    body,
    confidence: Number(get('confidence') ?? '0'),
    hash: get('hash') ?? '',
    promoted: get('promoted') === 'true',
    source: unquote(get('source')),
    createdAt: get('createdAt') ?? nowIso(),
    updatedAt: get('updatedAt') ?? nowIso(),
  }

  const result = PersistedInstinctSchema.safeParse(candidate)
  return result.success ? result.data : null
}

/**
 * Promote (or queue) an instinct.
 *
 * - confidence ≥ PROMOTION_THRESHOLD → write to promoted/<slug>.md
 * - otherwise → write to pending/<slug>.md
 *
 * Idempotent on (kind, title, body) hash. If the same instinct appears with a
 * higher confidence later, the file is updated in place (not duplicated). If
 * a pending instinct now meets the threshold, it is moved to promoted.
 */
export async function promoteInstinct(instinct: Instinct): Promise<{
  promoted: boolean
  path: string
  changed: boolean
}> {
  const hash = shortHash(`${instinct.kind}::${instinct.title}::${instinct.body}`)
  const slug = `${instinct.kind}-${slugify(instinct.title)}-${hash.slice(0, 6)}`
  const fileName = `${slug}.md`

  const promotedPath = path.join(PROMOTED_DIR, fileName)
  const pendingPath = path.join(PENDING_DIR, fileName)
  const targetPromoted = instinct.confidence >= PROMOTION_THRESHOLD
  const targetPath = targetPromoted ? promotedPath : pendingPath
  const otherPath = targetPromoted ? pendingPath : promotedPath

  // Look for an existing version (in either dir).
  const existingRaw =
    (await readIfExists(targetPath)) ?? (await readIfExists(otherPath))
  const existing = existingRaw ? parseInstinctFrontmatter(existingRaw) : null

  // No-op if existing matches and confidence didn't increase.
  if (existing && existing.hash === hash && existing.confidence >= instinct.confidence && existing.promoted === targetPromoted) {
    return { promoted: targetPromoted, path: targetPath, changed: false }
  }

  const persisted: PersistedInstinct = {
    ...instinct,
    source: instinct.source ?? 'reflection',
    hash,
    promoted: targetPromoted,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  }

  await atomicWrite(targetPath, instinctMarkdown(persisted))

  // If we moved across pending/promoted, remove the stale copy.
  if (existingRaw && (await readIfExists(otherPath)) !== null) {
    try {
      await fs.unlink(otherPath)
    } catch {
      /* best effort */
    }
  }

  return { promoted: targetPromoted, path: targetPath, changed: true }
}

// ─── Read-side ─────────────────────────────────────────────────────────────

/**
 * List the top-N promoted instincts ranked by `confidence × recency`.
 * Recency = 1 / (1 + ageInDays). Newer + higher-confidence wins.
 */
export async function listPromotedInstincts(limit: number): Promise<PersistedInstinct[]> {
  await ensureDir(PROMOTED_DIR)
  const files = await fs.readdir(PROMOTED_DIR).catch(() => [] as string[])

  const items: PersistedInstinct[] = []
  for (const f of files) {
    if (!f.endsWith('.md')) continue
    const raw = await readIfExists(path.join(PROMOTED_DIR, f))
    if (!raw) continue
    const parsed = parseInstinctFrontmatter(raw)
    if (parsed) items.push(parsed)
  }

  const now = Date.now()
  const score = (i: PersistedInstinct): number => {
    const ageDays = (now - new Date(i.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    const recency = 1 / (1 + Math.max(0, ageDays))
    return i.confidence * recency
  }

  return items.sort((a, b) => score(b) - score(a)).slice(0, limit)
}

/**
 * Get the latest N daily note files (by filename, which is YYYY-MM-DD).
 */
export async function listRecentDailyNotes(limit: number): Promise<Array<{ date: string; content: string }>> {
  await ensureDir(DAILY_DIR)
  const files = (await fs.readdir(DAILY_DIR).catch(() => [] as string[]))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .slice(0, limit)

  const out: Array<{ date: string; content: string }> = []
  for (const f of files) {
    const raw = await readIfExists(path.join(DAILY_DIR, f))
    if (raw) out.push({ date: f.replace('.md', ''), content: raw })
  }
  return out
}

/**
 * Get current bo.md profile (full text). Returns empty string if missing.
 */
export async function readBoProfile(): Promise<string> {
  return (await readIfExists(BO_FILE)) ?? ''
}

// Exposed for the context-injector cache.
export const VAULT_PATHS = {
  root: VAULT_ROOT,
  daily: DAILY_DIR,
  bo: BO_FILE,
  promoted: PROMOTED_DIR,
  pending: PENDING_DIR,
}
