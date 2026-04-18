/**
 * Obsidian-native writer for Jarvis.
 * Handles frontmatter injection, entity linkification, and MOC updates.
 * All writes go through the bridge when on Vercel.
 */

import { writeFile, readFile, mkdir, appendFile } from 'node:fs/promises'
import path from 'node:path'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const ENTITIES_PATH = path.join(VAULT_ROOT, '00-meta', 'entities.json')
const LOCK_FILE = path.join(VAULT_ROOT, '00-meta', '.moc-write.lock')

// ── Frontmatter ───────────────────────────────────────────────────────────────

export interface NoteMetadata {
  type: string
  title: string
  source_agent?: 'jarvis' | 'claude-code' | 'bo'
  tags?: string[]
  [key: string]: unknown
}

function stripFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  if (!content.startsWith('---')) return { meta: {}, body: content }
  const end = content.indexOf('\n---', 4)
  if (end === -1) return { meta: {}, body: content }
  const raw = content.slice(4, end)
  const meta: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
    }
  }
  return { meta, body: content.slice(end + 4).trimStart() }
}

export function applyFrontmatter(content: string, metadata: NoteMetadata): string {
  const { body } = stripFrontmatter(content)
  const now = new Date().toISOString().slice(0, 10)
  const { type: _t, title: _ti, source_agent: _sa, tags: _tags, ...rest } = metadata
  const fm: Record<string, unknown> = { ...rest }
  const lines = [
    `type: ${metadata.type}`,
    `title: "${metadata.title}"`,
    `created: ${now}`,
    `source_agent: ${metadata.source_agent ?? 'jarvis'}`,
    `tags: [${(metadata.tags ?? []).map((t) => `"${t}"`).join(', ')}]`,
    ...Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`),
  ]
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}

// ── Entity linkification ──────────────────────────────────────────────────────

interface Entity {
  name: string
  aliases: string[]
  path: string
  type: string
}

let entityCache: Entity[] | null = null
let entityCachedAt = 0
const ENTITY_TTL = 10 * 60 * 1000

async function loadEntities(): Promise<Entity[]> {
  if (entityCache && Date.now() - entityCachedAt < ENTITY_TTL) return entityCache
  try {
    const raw = await readFile(ENTITIES_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { entities: Entity[] }
    entityCache = parsed.entities
    entityCachedAt = Date.now()
    return entityCache
  } catch {
    return []
  }
}

export async function linkify(content: string): Promise<string> {
  const entities = await loadEntities()
  let result = content
  for (const entity of entities) {
    const terms = [entity.name, ...entity.aliases].sort((a, b) => b.length - a.length)
    for (const term of terms) {
      // Only link exact term, not already linked, not in frontmatter
      const regex = new RegExp(`(?<!\\[\\[)\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?!\\]\\])`, 'g')
      result = result.replace(regex, `[[${entity.path}|${term}]]`)
      break // link using first match only
    }
  }
  return result
}

// ── MOC update ────────────────────────────────────────────────────────────────

const MOC_MAP: Record<string, string> = {
  'topic': path.join(VAULT_ROOT, '05-knowledge', '_MOC-knowledge.md'),
  'project': path.join(VAULT_ROOT, '04-projects', '_MOC-projects.md'),
  'person': path.join(VAULT_ROOT, '06-people', '_MOC-people.md'),
  'daily': path.join(VAULT_ROOT, '01-daily', '_MOC-daily.md'),
  'decision': path.join(VAULT_ROOT, '04-projects', '_MOC-decisions.md'),
}

export async function updateMOC(noteType: string, notePath: string, title: string): Promise<void> {
  const mocPath = MOC_MAP[noteType]
  if (!mocPath) return

  // Simple lock: skip if locked (another write in progress)
  try {
    await readFile(LOCK_FILE, 'utf8')
    return // locked
  } catch { /* no lock, proceed */ }

  try {
    await writeFile(LOCK_FILE, Date.now().toString(), 'utf8')
    const link = `- [[${notePath}|${title}]]`
    // Check if already in MOC
    let existing = ''
    try { existing = await readFile(mocPath, 'utf8') } catch { /* new MOC */ }
    if (existing.includes(notePath)) return // already listed

    const entry = `${link} — added ${new Date().toISOString().slice(0, 10)}\n`
    await mkdir(path.dirname(mocPath), { recursive: true })
    await appendFile(mocPath, entry, 'utf8')
  } finally {
    try { await writeFile(LOCK_FILE, '', 'utf8') } catch { /* ignore */ }
  }
}

// ── Validate ──────────────────────────────────────────────────────────────────

export function validate(content: string, requiredType: string): string[] {
  const errors: string[] = []
  const { meta } = stripFrontmatter(content)
  if (!meta.type) errors.push('missing: type')
  else if (requiredType && meta.type !== requiredType) errors.push(`type mismatch: expected ${requiredType}, got ${meta.type}`)
  if (!meta.title) errors.push('missing: title')
  if (!meta.created) errors.push('missing: created')
  if (!meta.source_agent) errors.push('missing: source_agent')
  return errors
}

// ── Write note (main entry point) ─────────────────────────────────────────────

export async function writeNote(
  notePath: string,
  content: string,
  metadata: NoteMetadata,
  opts: { linkify?: boolean; updateMoc?: boolean } = {},
): Promise<void> {
  const abs = path.isAbsolute(notePath) ? notePath : path.join(VAULT_ROOT, notePath)
  const withFm = applyFrontmatter(content, metadata)
  const final = opts.linkify !== false ? await linkify(withFm) : withFm

  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, final, 'utf8')

  if (opts.updateMoc !== false) {
    const rel = notePath.replace(/\.md$/, '')
    await updateMOC(metadata.type, rel, metadata.title).catch(() => {/* non-fatal */})
  }
}
