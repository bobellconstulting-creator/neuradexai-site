/**
 * Jarvis consulting tool — findProspects
 *
 * Researches potential consulting prospects via searchWeb and writes
 * structured findings to COG/04-projects/neuradex-consulting/prospects.md.
 *
 * Free-first: delegates research to searchWeb (Tavily), zero paid calls.
 */
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ToolResult } from './tools'
import { dispatchTool } from './tools'

// ─── Constants ────────────────────────────────────────────────────────────────

const COG_ROOT = (process.env.COG_VAULT_ROOT ?? 'C:/Users/bobel/COG').replace(/\\/g, '/')
const PROSPECTS_FILE = `${COG_ROOT}/04-projects/neuradex-consulting/prospects.md`
const TOOL_LOG = `${COG_ROOT}/05-knowledge/jarvis-tool-log.md`

const DEFAULT_NICHE = 'small business AI automation midwest'
const DEFAULT_COUNT = 5

// ─── Schema ───────────────────────────────────────────────────────────────────

export const findProspectsSchema = z.object({
  niche: z.string().min(1).max(200).optional().default(DEFAULT_NICHE),
  count: z.number().int().min(1).max(20).optional().default(DEFAULT_COUNT),
})
export type FindProspectsArgs = z.infer<typeof findProspectsSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(ok: boolean, detail: string): string {
  return `[${now()}] findProspects ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Receipt sink must never break the caller.
  }
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface Prospect {
  name: string
  website: string
  fitScore: number  // 1-10
  reason: string
}

export interface FindProspectsResult {
  found: number
  filePath: string
  prospects: Prospect[]
}

// ─── Parsing helper ───────────────────────────────────────────────────────────

/**
 * Parse raw search result text into structured prospect entries.
 * Extracts business names, URLs, and constructs a fit assessment.
 * Returns up to `count` entries.
 */
function parseProspectsFromText(text: string, niche: string, count: number): Prospect[] {
  const prospects: Prospect[] = []

  // Heuristic: split on newlines, look for lines that contain a URL or business-like pattern
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // URL regex — catches http(s):// and bare domain.tld patterns
  const urlRe = /https?:\/\/[^\s)>]+|(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s)>]*)?/g

  for (const line of lines) {
    if (prospects.length >= count) break

    // Skip lines that look like section headers or pure filler
    if (/^#+\s/.test(line) || line.length < 10) continue

    const urls = line.match(urlRe)
    const website = urls ? urls[0].replace(/[.,;)>]+$/, '') : ''

    // Derive a "name" from the URL or the first few words of the line
    let name = ''
    if (website) {
      const domain = website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
      name = domain.split('.')[0].replace(/-/g, ' ')
      // Title-case the name
      name = name.replace(/\b\w/g, (c) => c.toUpperCase())
    } else {
      // Fallback: first 4 words of the line
      name = line.split(/\s+/).slice(0, 4).join(' ')
    }

    if (!name) continue

    // Avoid duplicate names
    if (prospects.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue

    // Simple fit score: base 6, +1 if niche keyword appears in line, +1 for website present
    const nicheWords = niche.toLowerCase().split(/\s+/)
    const lineLC = line.toLowerCase()
    const nicheHits = nicheWords.filter((w) => lineLC.includes(w)).length
    const fitScore = Math.min(10, 5 + nicheHits + (website ? 1 : 0))

    prospects.push({
      name,
      website: website || 'unknown',
      fitScore,
      reason: line.slice(0, 200),
    })
  }

  return prospects
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

function buildProspectBlock(prospects: Prospect[], niche: string): string {
  const ts = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const rows = prospects
    .map(
      (p) =>
        `### ${p.name}\n- **Website:** ${p.website}\n- **Fit Score:** ${p.fitScore}/10\n- **Why:** ${p.reason}`,
    )
    .join('\n\n')

  return `\n---\n## Research Run — ${ts}\n**Niche:** ${niche}\n\n${rows}\n`
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function findProspects(raw: unknown): Promise<ToolResult<FindProspectsResult>> {
  const parsed = findProspectsSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt(false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { niche, count } = parsed.data

  // 1. Search the web
  const searchResult = await dispatchTool('searchWeb', {
    query: `${niche} businesses looking for AI automation help`,
    count: 10,
  })

  // Extract text from search result — searchWeb returns { ok, result: { answer, results } }
  let rawText = ''
  if (searchResult.ok && searchResult.result) {
    const sr = searchResult.result as Record<string, unknown>
    if (typeof sr.answer === 'string') rawText += sr.answer + '\n'
    if (Array.isArray(sr.results)) {
      for (const item of sr.results as Array<Record<string, unknown>>) {
        if (typeof item.content === 'string') rawText += item.content + '\n'
        if (typeof item.title === 'string') rawText += item.title + '\n'
        if (typeof item.url === 'string') rawText += item.url + '\n'
      }
    }
  }

  // 2. Parse prospects from text
  const prospects = parseProspectsFromText(rawText, niche, count)

  // 3. Write to prospects.md (append)
  const block = buildProspectBlock(prospects, niche)

  try {
    await fs.mkdir(path.dirname(PROSPECTS_FILE), { recursive: true })

    // Ensure header exists on first create
    let existing = ''
    try {
      existing = await fs.readFile(PROSPECTS_FILE, 'utf8')
    } catch {
      existing = ''
    }

    if (existing.length === 0) {
      const header =
        '# Neuradex AI — Consulting Prospects\n\nResearch runs appended below. Review and promote to CRM.\n'
      await fs.writeFile(PROSPECTS_FILE, header + block, 'utf8')
    } else {
      await fs.appendFile(PROSPECTS_FILE, block, 'utf8')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt(false, `file write failed: ${msg}`)
    await appendReceipt(r)
    return { ok: false, error: `Failed to write prospects file: ${msg}`, receipt: r }
  }

  const r = mkReceipt(true, `niche="${niche.slice(0, 60)}" found=${prospects.length} file=${PROSPECTS_FILE}`)
  await appendReceipt(r)

  return {
    ok: true,
    result: { found: prospects.length, filePath: PROSPECTS_FILE, prospects },
    receipt: r,
  }
}
