/**
 * Builds Jarvis's runtime system prompt using a two-layer architecture:
 *
 *   Layer 1 — primary.md (~800 tokens): tight startup anchor, always loaded,
 *             60-second cache (changes rarely).
 *
 *   Layer 2 — dynamic vault content (~4.2k token budget): promoted instincts,
 *             current bo.md delta, last 3 daily notes. 5-minute cache.
 *
 * On the first message of a new day (today's daily note does not yet exist),
 * the full SOUL.md is injected instead of the primary.md routing stub. This
 * ensures Jarvis has its full persona grounding at session start without
 * loading the heavy file on every subsequent turn.
 *
 * Total cap: 5,000 tokens for the combined layer-2 section.
 * Token estimate: ~4 chars ≈ 1 token (no tiktoken dependency).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  listPromotedInstincts,
  listRecentDailyNotes,
  readBoProfile,
  VAULT_PATHS,
} from './vault'
import type { PersistedInstinct } from './types'

// ─── Paths ─────────────────────────────────────────────────────────────────

const PRIMARY_MD_PATH = 'C:/Users/bobel/.openclaw/primary.md'
const SOUL_PATH = path.join(process.cwd(), 'lib', 'personas', 'jarvis.soul.md')

// ─── Budget config ─────────────────────────────────────────────────────────

const MEMORY_TOKEN_BUDGET = 5_000
const TOP_INSTINCTS = 10
const RECENT_DAILIES = 3

// ─── Cache TTLs ────────────────────────────────────────────────────────────

const PRIMARY_CACHE_TTL_MS = 60 * 1000        // 60 seconds — changes rarely
const VAULT_CACHE_TTL_MS   = 5 * 60 * 1000   // 5 minutes  — dynamic content

// ─── Rough tokenizer ───────────────────────────────────────────────────────

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function trimToTokens(text: string, budget: number): string {
  const max = Math.max(0, budget) * 4
  if (text.length <= max) return text
  return text.slice(0, max) + '\n…[truncated for token budget]'
}

// ─── Cache: primary.md ─────────────────────────────────────────────────────

interface PrimaryCache {
  content: string
  fetchedAt: number
}

let primaryCache: PrimaryCache | null = null

async function loadPrimaryMd(): Promise<string> {
  if (primaryCache && Date.now() - primaryCache.fetchedAt < PRIMARY_CACHE_TTL_MS) {
    return primaryCache.content
  }
  try {
    const content = await readFile(PRIMARY_MD_PATH, 'utf8')
    primaryCache = { content, fetchedAt: Date.now() }
    return content
  } catch {
    // Defensive fallback — never break Jarvis if primary.md is missing.
    const fallback = `# Jarvis\n\nYou are Jarvis, Bo Bell's AI chief of operations.\n`
    primaryCache = { content: fallback, fetchedAt: Date.now() }
    return fallback
  }
}

// ─── Cache: SOUL.md ────────────────────────────────────────────────────────

let soulCache: string | null = null

async function loadSoul(): Promise<string> {
  if (soulCache !== null) return soulCache
  try {
    soulCache = await readFile(SOUL_PATH, 'utf8')
  } catch {
    soulCache = `# Jarvis\n\nYou are Jarvis, Bo Bell's AI chief of operations.\n`
  }
  return soulCache
}

// ─── Cache: vault memory ───────────────────────────────────────────────────

interface VaultCache {
  bo: string
  instincts: PersistedInstinct[]
  dailies: Array<{ date: string; content: string }>
  fetchedAt: number
}

let vaultCache: VaultCache | null = null

async function getVaultCached(): Promise<VaultCache> {
  if (vaultCache && Date.now() - vaultCache.fetchedAt < VAULT_CACHE_TTL_MS) {
    return vaultCache
  }
  const [bo, instincts, dailies] = await Promise.all([
    readBoProfile(),
    listPromotedInstincts(TOP_INSTINCTS),
    listRecentDailyNotes(RECENT_DAILIES),
  ])
  vaultCache = { bo, instincts, dailies, fetchedAt: Date.now() }
  return vaultCache
}

/**
 * Force-clear the vault cache. Call after a reflection so the next Jarvis
 * turn picks up freshly promoted instincts and updated daily notes.
 */
export function invalidateMemoryCache(): void {
  vaultCache = null
}

// ─── Fresh-session detection ───────────────────────────────────────────────

/**
 * Returns true when today's daily note does not yet exist in the vault.
 * That condition signals the first interaction of the day — inject full SOUL.
 */
async function isFreshDaySession(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const { promises: fs } = await import('node:fs')
  const todayFile = `${VAULT_PATHS.daily}/${today}.md`
  try {
    await fs.access(todayFile)
    return false // file exists → not a fresh session
  } catch {
    return true  // file missing → fresh day, load full SOUL
  }
}

// ─── Renderers ─────────────────────────────────────────────────────────────

function renderInstincts(items: PersistedInstinct[]): string {
  if (items.length === 0) return ''
  const lines = items.map(
    (i, idx) =>
      `${idx + 1}. [${i.kind}] ${i.title} (conf ${i.confidence.toFixed(2)})\n   ${i.body.replace(/\n+/g, ' ').trim()}`,
  )
  return `## Promoted Instincts (highest-signal recall)\n${lines.join('\n')}`
}

function renderBo(bo: string): string {
  if (!bo.trim()) return ''
  return `## Current Bo Profile (from vault)\n${bo.trim()}`
}

function renderDailies(items: Array<{ date: string; content: string }>): string {
  if (items.length === 0) return ''
  const blocks = items.map(({ date, content }) => `### ${date}\n${content.trim()}`)
  return `## Recent Daily Notes\n${blocks.join('\n\n')}`
}

// ─── Budget shaper ─────────────────────────────────────────────────────────

/**
 * Drop oldest daily notes first, then lowest-confidence instincts, until the
 * full memory section fits within MEMORY_TOKEN_BUDGET tokens.
 */
function fitToBudget(
  bo: string,
  instincts: PersistedInstinct[],
  dailies: Array<{ date: string; content: string }>,
): string {
  let workingDailies = [...dailies]
  let workingInstincts = [...instincts]

  const compose = (): string => {
    const sections = [
      renderInstincts(workingInstincts),
      renderBo(bo),
      renderDailies(workingDailies),
    ].filter(Boolean)
    return sections.join('\n\n')
  }

  let composed = compose()

  while (approxTokens(composed) > MEMORY_TOKEN_BUDGET) {
    if (workingDailies.length > 0) {
      workingDailies.pop() // drop the oldest (last in descending list)
    } else if (workingInstincts.length > 0) {
      workingInstincts = workingInstincts
        .slice()
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, workingInstincts.length - 1)
    } else {
      // Even bo profile alone exceeds budget — hard-trim it.
      const trimmed = trimToTokens(bo, MEMORY_TOKEN_BUDGET)
      return renderBo(trimmed)
    }
    composed = compose()
  }

  return composed
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build the full Jarvis system prompt.
 *
 * Fresh day (today's daily note absent):
 *   SOUL.md + memory section
 *
 * Subsequent turns:
 *   primary.md + memory section
 *
 * The memory section is wrapped in a fenced block so the model can clearly
 * distinguish persona ground-truth from learned signal.
 */
export async function buildJarvisSystemPrompt(): Promise<string> {
  const [freshDay, vault] = await Promise.all([
    isFreshDaySession(),
    getVaultCached(),
  ])

  // Choose the anchor: full SOUL on day-start, lean primary.md otherwise.
  const anchor = freshDay ? await loadSoul() : await loadPrimaryMd()

  const memorySection = fitToBudget(vault.bo, vault.instincts, vault.dailies)

  if (!memorySection.trim()) {
    return anchor
  }

  return `${anchor}

---

# JARVIS LEARNED MEMORY (auto-injected from vault, max ${MEMORY_TOKEN_BUDGET} tokens)

${memorySection}

---
End learned memory. Apply it as ground truth about Bo's preferences and history. Never repeat memory back unless asked.`
}
