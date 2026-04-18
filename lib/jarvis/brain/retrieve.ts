/**
 * Brain retrieval — semantic search over COG vault.
 * On Vercel: calls bridge endpoint. Locally: reads embeddings.json directly.
 * Falls back to empty results gracefully — never breaks a turn.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { embed, cosine } from './embed'
import { callBridge, bridgeAvailable } from '../bridge-client'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const BRAIN_DIR  = path.join(VAULT_ROOT, '.brain')
const INDEX_FILE = path.join(BRAIN_DIR, 'embeddings.json')

export interface SearchHit {
  path: string
  score: number
  snippet: string
  title?: string
}

interface IndexEntry {
  path: string
  title?: string
  chunk: string
  embedding: number[]
}

// ── Local search (runs when bridge is local / on Bo's machine) ────────────────

async function loadIndex(): Promise<IndexEntry[]> {
  try {
    const raw = await readFile(INDEX_FILE, 'utf8')
    return JSON.parse(raw) as IndexEntry[]
  } catch {
    return []
  }
}

async function localSearch(query: string, k = 8): Promise<SearchHit[]> {
  const qEmbed = await embed(query)
  if (!qEmbed) return []

  const index = await loadIndex()
  if (index.length === 0) return []

  const scored = index.map((entry) => ({
    path: entry.path,
    title: entry.title,
    score: cosine(qEmbed, entry.embedding),
    snippet: entry.chunk.slice(0, 300),
  }))

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((h) => h.score > 0.5)
}

// ── Bridge search (Vercel → local) ────────────────────────────────────────────

async function bridgeSearch(query: string, k = 8): Promise<SearchHit[]> {
  try {
    const result = await callBridge('brain.search', { query, k }) as { hits?: SearchHit[] }
    return result?.hits ?? []
  } catch {
    return []
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function brainSearch(query: string, k = 8): Promise<SearchHit[]> {
  try {
    if (bridgeAvailable()) {
      return await bridgeSearch(query, k)
    }
    return await localSearch(query, k)
  } catch {
    return []
  }
}

export function formatHitsForPrompt(hits: SearchHit[]): string {
  if (hits.length === 0) return ''
  const lines = hits.map((h, i) =>
    `${i + 1}. [${h.title ?? h.path}] (score ${h.score.toFixed(2)})\n   ${h.snippet}`
  )
  return `## Relevant Vault Context (semantic search)\n${lines.join('\n\n')}`
}
