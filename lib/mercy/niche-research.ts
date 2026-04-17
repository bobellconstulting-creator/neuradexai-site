/**
 * Merit niche research — Gemini 2.5 Flash generates Etsy niche ideas.
 *
 * Results are written to COG/04-projects/mercy-engine/NICHE-QUEUE.md
 * using the same comment-marker pattern as INCOME-LEDGER.md.
 *
 * Env vars:
 *   GOOGLE_API_KEY  — Gemini API key
 *   COG_PATH        — optional override (default C:/Users/bobel/COG)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NicheIdea {
  id: string
  niche: string
  keywords: string[]
  designPrompt: string
  productTypes: Array<'tshirt' | 'mug' | 'poster' | 'hoodie'>
  digitalProductIdea: string
  estimatedDemand: 'high' | 'medium' | 'low'
  status: 'queued' | 'in-progress' | 'completed' | 'abandoned'
  createdAt: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const COG_BASE   = process.env.COG_PATH ?? 'C:/Users/bobel/COG'
const QUEUE_PATH = path.join(COG_BASE, '04-projects', 'mercy-engine', 'NICHE-QUEUE.md')
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? ''

const JSON_START = '<!-- mercy-niche-json-start -->'
const JSON_END   = '<!-- mercy-niche-json-end -->'

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(category: string): string {
  return `You are an Etsy POD (print-on-demand) niche expert. Generate exactly 5 profitable niche ideas for the category: "${category}".

Return ONLY a valid JSON array with no markdown fences or commentary. Each element must match this shape exactly:
{
  "niche": "string (short niche name, e.g. 'deer hunting season opener')",
  "keywords": ["array", "of", "exactly", "10", "etsy", "seo", "keywords"],
  "designPrompt": "string (detailed text-to-image prompt for SDXL, 50-100 words, describes the design visually)",
  "productTypes": ["tshirt", "mug"],
  "digitalProductIdea": "string (e.g. '50 deer hunting prompts PDF')",
  "estimatedDemand": "high" | "medium" | "low"
}

Categories available for productTypes: tshirt, mug, poster, hoodie. Pick 2-4 that fit the niche.
Focus on niches with real Etsy search volume and low competition.`
}

// ─── Gemini fetch ─────────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('niche-research: GOOGLE_API_KEY / GEMINI_API_KEY not set')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`niche-research: Gemini HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as GeminiResponse
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) {
    throw new Error('niche-research: Gemini returned no text content')
  }
  return text
}

// ─── Parse + validate response ────────────────────────────────────────────────

const VALID_PRODUCT_TYPES = new Set(['tshirt', 'mug', 'poster', 'hoodie'])
const VALID_DEMAND = new Set(['high', 'medium', 'low'])

function parseNicheIdeas(raw: string, category: string): NicheIdea[] {
  // Strip any accidental markdown fences Gemini might add
  const cleaned = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`niche-research: failed to parse Gemini JSON for category "${category}"`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`niche-research: expected JSON array, got ${typeof parsed}`)
  }

  return parsed.map((item: unknown, idx: number): NicheIdea => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`niche-research: item[${idx}] is not an object`)
    }
    const obj = item as Record<string, unknown>

    const niche = typeof obj.niche === 'string' ? obj.niche : `${category}-idea-${idx}`
    const keywords = Array.isArray(obj.keywords)
      ? (obj.keywords as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 10)
      : []
    const designPrompt = typeof obj.designPrompt === 'string' ? obj.designPrompt : ''
    const productTypes = Array.isArray(obj.productTypes)
      ? (obj.productTypes as unknown[]).filter(
          (p): p is 'tshirt' | 'mug' | 'poster' | 'hoodie' =>
            typeof p === 'string' && VALID_PRODUCT_TYPES.has(p),
        )
      : ['tshirt' as const]
    const digitalProductIdea =
      typeof obj.digitalProductIdea === 'string' ? obj.digitalProductIdea : ''
    const estimatedDemand =
      typeof obj.estimatedDemand === 'string' && VALID_DEMAND.has(obj.estimatedDemand)
        ? (obj.estimatedDemand as 'high' | 'medium' | 'low')
        : 'medium'

    return {
      id: randomUUID(),
      niche,
      keywords,
      designPrompt,
      productTypes,
      digitalProductIdea,
      estimatedDemand,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
  })
}

// ─── COG write ────────────────────────────────────────────────────────────────

function buildMarkdown(allIdeas: NicheIdea[]): string {
  const rows = allIdeas
    .map(
      (n) =>
        `| ${n.id.slice(0, 8)} | ${n.niche} | ${n.estimatedDemand} | ${n.status} | ${n.createdAt.slice(0, 10)} |`,
    )
    .join('\n')

  const table = [
    `# Merit Niche Queue`,
    `Last updated: ${new Date().toISOString()}`,
    ``,
    `| ID | Niche | Demand | Status | Created |`,
    `|----|-------|--------|--------|---------|`,
    rows,
    ``,
  ].join('\n')

  const jsonBlock = [JSON_START, JSON.stringify(allIdeas, null, 2), JSON_END, ''].join('\n')

  return table + jsonBlock
}

async function readExistingIdeas(): Promise<NicheIdea[]> {
  let raw: string
  try {
    raw = await fs.readFile(QUEUE_PATH, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const start = raw.indexOf(JSON_START)
  const end   = raw.indexOf(JSON_END)
  if (start === -1 || end === -1) return []

  const jsonStr = raw.slice(start + JSON_START.length, end).trim()
  try {
    const parsed = JSON.parse(jsonStr)
    return Array.isArray(parsed) ? (parsed as NicheIdea[]) : []
  } catch {
    return []
  }
}

async function writeQueue(ideas: NicheIdea[]): Promise<void> {
  const content = buildMarkdown(ideas)
  const tmpPath = QUEUE_PATH + '.tmp'
  await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true })
  await fs.writeFile(tmpPath, content, 'utf8')
  await fs.rename(tmpPath, QUEUE_PATH)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateNicheIdeas(category: string): Promise<NicheIdea[]> {
  const prompt = buildPrompt(category)
  const raw    = await callGemini(prompt)
  const ideas  = parseNicheIdeas(raw, category)

  // Merge with existing queue (append new, skip duplicates by niche name)
  const existing   = await readExistingIdeas()
  const existingNames = new Set(existing.map((n) => n.niche.toLowerCase()))
  const novel      = ideas.filter((n) => !existingNames.has(n.niche.toLowerCase()))
  const merged     = [...existing, ...novel]

  await writeQueue(merged)
  return novel
}
