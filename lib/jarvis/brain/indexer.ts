/**
 * COG vault indexer — run locally via `node lib/jarvis/brain/indexer.mjs`
 * Walks COG markdown files, chunks them, embeds via Gemini, writes embeddings.json.
 * Run nightly or on-demand. Never runs on Vercel.
 */

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { embed } from './embed'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const BRAIN_DIR  = path.join(VAULT_ROOT, '.brain')
const INDEX_FILE = path.join(BRAIN_DIR, 'embeddings.json')
const CHUNK_SIZE = 500  // tokens approx (~2000 chars)
const CHUNK_OVERLAP = 50

const SKIP_DIRS = new Set(['.brain', '.git', 'node_modules', '_archive'])
const SKIP_FILES = new Set(['NEXUS-INDEX.md', 'RESEARCH-QUEUE.md'])

interface IndexEntry {
  path: string
  title?: string
  chunk: string
  embedding: number[]
  indexedAt: string
}

function chunkText(text: string, size = CHUNK_SIZE * 4, overlap = CHUNK_OVERLAP * 4): string[] {
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}

function extractTitle(content: string, filePath: string): string {
  const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (titleMatch) return titleMatch[1]
  const h1Match = content.match(/^#\s+(.+)/m)
  if (h1Match) return h1Match[1]
  return path.basename(filePath, '.md')
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  return content.slice(end + 4).trimStart()
}

async function walkMd(dir: string): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...await walkMd(full))
      } else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
        files.push(full)
      }
    }
  } catch { /* skip unreadable dirs */ }
  return files
}

export async function runIndex(opts: { force?: boolean } = {}): Promise<{ indexed: number; skipped: number; errors: number }> {
  await mkdir(BRAIN_DIR, { recursive: true })

  let existing: IndexEntry[] = []
  const existingMap = new Map<string, { embedding: number[]; indexedAt: string }>()
  try {
    existing = JSON.parse(await readFile(INDEX_FILE, 'utf8')) as IndexEntry[]
    for (const e of existing) existingMap.set(`${e.path}::${e.chunk.slice(0, 40)}`, { embedding: e.embedding, indexedAt: e.indexedAt })
  } catch { /* fresh index */ }

  const files = await walkMd(VAULT_ROOT)
  const entries: IndexEntry[] = []
  let indexed = 0, skipped = 0, errors = 0

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8')
      const title = extractTitle(content, file)
      const body = stripFrontmatter(content)
      const relPath = path.relative(VAULT_ROOT, file).replace(/\\/g, '/')
      const chunks = chunkText(body)
      const mtime = (await stat(file)).mtimeMs

      for (const chunk of chunks) {
        if (!chunk.trim()) continue
        const cacheKey = `${relPath}::${chunk.slice(0, 40)}`
        const cached = existingMap.get(cacheKey)

        if (!opts.force && cached) {
          entries.push({ path: relPath, title, chunk, embedding: cached.embedding, indexedAt: cached.indexedAt })
          skipped++
          continue
        }

        const embedding = await embed(`${title}\n\n${chunk}`)
        if (!embedding) { errors++; continue }

        entries.push({ path: relPath, title, chunk, embedding, indexedAt: new Date().toISOString() })
        indexed++

        // Rate limit: ~1 req/sec to stay within Gemini free tier
        await new Promise((r) => setTimeout(r, 1100))
      }
    } catch { errors++ }
  }

  await writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), 'utf8')
  return { indexed, skipped, errors }
}

// Run directly: node indexer.mjs
if (process.argv[1]?.includes('indexer')) {
  const force = process.argv.includes('--force')
  console.log('Starting COG brain index...')
  runIndex({ force }).then(({ indexed, skipped, errors }) => {
    console.log(`Done. indexed=${indexed} skipped=${skipped} errors=${errors}`)
  }).catch(console.error)
}
