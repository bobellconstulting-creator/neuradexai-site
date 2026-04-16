/**
 * Jarvis self-learning tools.
 *
 * learnTopic  — Research any subject via Tavily + Gemini, persist facts to COG.
 * searchKnowledge — Full-text search across stored COG topic indexes.
 *
 * Free-first contract:
 *   - Search:    Tavily (TAVILY_API_KEY)
 *   - Synthesis: Gemini 2.5 Flash (GOOGLE_API_KEY)
 *   - No OpenAI, no Anthropic, no paid fallbacks.
 *
 * Resilience contract:
 *   - Individual search/synthesis failures are caught and logged; the tool
 *     completes with whatever it managed to collect (ok: true, partial facts).
 *   - Only hard I/O failures (can't write to COG) return ok: false.
 *
 * Writes:
 *   COG/05-knowledge/topics/<slug>/index.md  — full topic index
 *   COG/05-knowledge/instincts/promoted/     — one file per high-conf fact
 *   COG/05-knowledge/jarvis-tool-log.md      — receipt log
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { promoteInstinct } from './vault'
import type { ToolResult } from './tools'

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const TOPICS_DIR = path.join(VAULT_ROOT, '05-knowledge', 'topics')
const INSTINCTS_DIR = path.join(VAULT_ROOT, '05-knowledge', 'instincts', 'promoted')
const TOOL_LOG = path.join(VAULT_ROOT, '05-knowledge', 'jarvis-tool-log.md')

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Confidence assigned to web-sourced facts. Meets the 0.6 promotion threshold.
const WEB_FACT_CONFIDENCE = 0.65

// ─── Zod schemas (exported so tools.ts can register them) ─────────────────────

export const learnTopicSchema = z.object({
  topic: z.string().min(1).max(200),
  count: z.number().int().min(1).max(100).optional().default(20),
  depth: z.enum(['surface', 'deep']).optional().default('deep'),
})
export type LearnTopicArgs = z.infer<typeof learnTopicSchema>

export const searchKnowledgeSchema = z.object({
  query: z.string().min(1).max(400),
  limit: z.number().int().min(1).max(20).optional().default(10),
})
export type SearchKnowledgeArgs = z.infer<typeof searchKnowledgeSchema>

// ─── Internal types ────────────────────────────────────────────────────────────

interface KnowledgeFact {
  title: string
  body: string
  confidence: number
  tags: string[]
}

interface TavilyResult {
  url: string
  title: string
  content: string
  score?: number
}

interface TavilyResponse {
  results?: TavilyResult[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(tool: string, ok: boolean, detail: string): string {
  return `[${now()}] ${tool} ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Receipt sink must never break the caller.
  }
}

/**
 * Atomic write: stage to a .tmp file then rename.
 * Rename is atomic on the same filesystem (Windows NTFS + POSIX both guarantee this).
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, filePath)
}

/** Convert a topic string to a filesystem-safe slug. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Deduplicate an array of Tavily results by URL. */
function dedupeByUrl(results: TavilyResult[]): TavilyResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })
}

/** Generate search queries for a topic (up to 5). */
function buildQueries(topic: string, depth: 'surface' | 'deep'): string[] {
  const base = topic.trim()
  if (depth === 'surface') {
    return [`${base} overview`, `${base} key facts`, `${base} basics`]
  }
  return [
    `${base} comprehensive guide`,
    `${base} advanced techniques`,
    `${base} common problems and solutions`,
    `${base} best practices`,
    `${base} expert tips`,
  ]
}

// ─── Tavily search ─────────────────────────────────────────────────────────────

async function tavilySearch(query: string, apiKey: string): Promise<TavilyResult[]> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      search_depth: 'advanced',
    }),
  })

  if (!res.ok) {
    throw new Error(`Tavily HTTP ${res.status}: ${await res.text().catch(() => '(no body)')}`)
  }

  const data: unknown = await res.json()
  // Narrow unknown → TavilyResponse safely
  if (typeof data !== 'object' || data === null) return []
  const typed = data as TavilyResponse
  return Array.isArray(typed.results) ? typed.results : []
}

// ─── Gemini synthesis ──────────────────────────────────────────────────────────

interface GeminiFactOutput {
  facts: Array<{ title: string; body: string; confidence: number; tags: string[] }>
}

const GeminiFactOutputSchema = z.object({
  facts: z.array(
    z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(1000),
      confidence: z.number().min(0).max(1),
      tags: z.array(z.string()).default([]),
    }),
  ),
})

async function extractFactsWithGemini(
  topic: string,
  content: string,
  apiKey: string,
): Promise<KnowledgeFact[]> {
  const prompt = `You are a fact extractor. Given content about "${topic}", extract the most valuable, concrete, actionable facts.

Return a JSON object with this exact shape:
{"facts": [{"title": "short fact title", "body": "explanation (1-3 sentences)", "confidence": 0.0-1.0, "tags": ["tag1"]}]}

Rules:
- Extract 3-8 facts per chunk of content
- Title must be ≤ 160 chars, body ≤ 800 chars
- Confidence: 0.9 = definitively true, 0.7 = well-supported, 0.6 = plausible
- Tags: 1-5 lowercase single-word tags relevant to the fact
- Skip vague generalities; prefer specific, actionable knowledge
- Return ONLY the JSON object, no markdown fences

Content:
${content.slice(0, 6000)}`

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${await res.text().catch(() => '(no body)')}`)
  }

  const data: unknown = await res.json()
  // Navigate Gemini response envelope safely
  const text = extractGeminiText(data)
  if (!text) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Sometimes Gemini wraps in markdown fences despite the instruction
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (!match) return []
    try {
      parsed = JSON.parse(match[1])
    } catch {
      return []
    }
  }

  const validated = GeminiFactOutputSchema.safeParse(parsed)
  if (!validated.success) return []

  return validated.data.facts.map((f) => ({
    title: f.title,
    body: f.body,
    confidence: Math.min(f.confidence, 1),
    tags: f.tags,
  }))
}

/** Safely extract the text part from Gemini's nested response envelope. */
function extractGeminiText(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  const candidates = d['candidates']
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const first = candidates[0]
  if (typeof first !== 'object' || first === null) return null
  const content = (first as Record<string, unknown>)['content']
  if (typeof content !== 'object' || content === null) return null
  const parts = (content as Record<string, unknown>)['parts']
  if (!Array.isArray(parts) || parts.length === 0) return null
  const part = parts[0]
  if (typeof part !== 'object' || part === null) return null
  const text = (part as Record<string, unknown>)['text']
  return typeof text === 'string' ? text : null
}

// ─── topic index markdown builder ─────────────────────────────────────────────

function buildTopicIndex(
  topic: string,
  slug: string,
  facts: KnowledgeFact[],
  sourceCount: number,
): string {
  const tags = [...new Set(facts.flatMap((f) => f.tags))].slice(0, 15)
  const frontmatter = [
    '---',
    `topic: ${topic}`,
    `slug: ${slug}`,
    `learned: ${now()}`,
    `factsCount: ${facts.length}`,
    `sources: ${sourceCount}`,
    `tags: [${tags.map((t) => `"${t}"`).join(', ')}]`,
    '---',
    '',
  ].join('\n')

  const header = `# Knowledge: ${topic}\n\n## Facts\n`

  const factLines = facts
    .map((f, i) => `${i + 1}. **${f.title}** — ${f.body} (conf: ${f.confidence.toFixed(2)})`)
    .join('\n')

  return frontmatter + header + factLines + '\n'
}

// ─── learnTopic ────────────────────────────────────────────────────────────────

export interface LearnTopicResult {
  factsLearned: number
  topicSlug: string
  sourcesSearched: number
  instinctsPromoted: number
}

export async function learnTopic(raw: unknown): Promise<ToolResult<LearnTopicResult>> {
  const parsed = learnTopicSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('learnTopic', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { topic, count, depth } = parsed.data
  const slug = slugify(topic)
  const tavilyKey = process.env.TAVILY_API_KEY
  const geminiKey = process.env.GOOGLE_API_KEY

  if (!tavilyKey) {
    const r = mkReceipt('learnTopic', false, 'TAVILY_API_KEY not set')
    await appendReceipt(r)
    return { ok: false, error: 'TAVILY_API_KEY not configured', receipt: r }
  }
  if (!geminiKey) {
    const r = mkReceipt('learnTopic', false, 'GOOGLE_API_KEY not set')
    await appendReceipt(r)
    return { ok: false, error: 'GOOGLE_API_KEY not configured', receipt: r }
  }

  const queries = buildQueries(topic, depth)
  const allResults: TavilyResult[] = []

  // 1. Search — partial failures are swallowed, we proceed with what we have
  for (const query of queries) {
    try {
      const results = await tavilySearch(query, tavilyKey)
      allResults.push(...results)
    } catch (err) {
      // Log but continue — one failed query is not fatal
      console.error('[learnTopic] tavily search failed:', err instanceof Error ? err.message : err)
    }
  }

  const dedupedResults = dedupeByUrl(allResults)

  // 2. Extract facts per source via Gemini — individual failures swallowed
  const allFacts: KnowledgeFact[] = []
  const targetFacts = count

  for (const result of dedupedResults) {
    if (allFacts.length >= targetFacts) break
    const content = `Title: ${result.title}\nURL: ${result.url}\n\n${result.content}`
    try {
      const facts = await extractFactsWithGemini(topic, content, geminiKey)
      allFacts.push(...facts)
    } catch (err) {
      console.error(
        '[learnTopic] gemini extraction failed for',
        result.url,
        ':',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Dedupe facts by exact title (case-insensitive)
  const seenTitles = new Set<string>()
  const uniqueFacts = allFacts.filter((f) => {
    const key = f.title.toLowerCase().trim()
    if (seenTitles.has(key)) return false
    seenTitles.add(key)
    return true
  })

  // Trim to requested count
  const facts = uniqueFacts.slice(0, targetFacts)

  // 3. Write topic index to COG
  const indexPath = path.join(TOPICS_DIR, slug, 'index.md')
  const indexContent = buildTopicIndex(topic, slug, facts, dedupedResults.length)
  try {
    await atomicWrite(indexPath, indexContent)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt('learnTopic', false, `index write failed: ${msg}`)
    await appendReceipt(r)
    return { ok: false, error: `Failed to write topic index: ${msg}`, receipt: r }
  }

  // 4. Synthesis document — second Gemini pass for coherent narrative + related topics
  try {
    const allFactText = facts.map((f, i) => `${i + 1}. ${f.title}: ${f.body}`).join('\n')
    const synthPrompt = `You are a knowledge synthesizer. Given these facts about "${topic}", write a structured synthesis note.

Facts:
${allFactText}

Return a JSON object with this exact shape:
{
  "background": "2-3 sentence context/overview",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "actionItems": ["specific action 1", "specific action 2"],
  "openQuestions": ["question worth researching 1", "question 2"],
  "relatedTopics": ["adjacent topic 1", "adjacent topic 2", "adjacent topic 3"]
}

Return ONLY the JSON object, no markdown fences.`

    const synthRes = await fetch(`${GEMINI_ENDPOINT}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: synthPrompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
      }),
    })

    if (synthRes.ok) {
      const synthData: unknown = await synthRes.json()
      const synthText = extractGeminiText(synthData)
      if (synthText) {
        let synthParsed: unknown
        try { synthParsed = JSON.parse(synthText) } catch { synthParsed = null }
        const sp = synthParsed as Record<string, unknown> | null
        if (sp && typeof sp === 'object') {
          const synthMd = [
            `---`,
            `topic: ${topic}`,
            `slug: ${slug}`,
            `synthesized: ${now()}`,
            `---`,
            ``,
            `# Synthesis: ${topic}`,
            ``,
            `## Background`,
            typeof sp.background === 'string' ? sp.background : '',
            ``,
            `## Key Insights`,
            ...(Array.isArray(sp.keyInsights) ? sp.keyInsights.map((i: unknown) => `- ${i}`) : []),
            ``,
            `## Action Items`,
            ...(Array.isArray(sp.actionItems) ? sp.actionItems.map((a: unknown) => `- ${a}`) : []),
            ``,
            `## Open Questions`,
            ...(Array.isArray(sp.openQuestions) ? sp.openQuestions.map((q: unknown) => `- ${q}`) : []),
            ``,
            `## Related Topics`,
            ...(Array.isArray(sp.relatedTopics) ? sp.relatedTopics.map((t: unknown) => `- ${t}`) : []),
          ].join('\n')

          const synthPath = path.join(TOPICS_DIR, slug, 'synthesis.md')
          await atomicWrite(synthPath, synthMd).catch(() => { /* non-fatal */ })
        }
      }
    }
  } catch (err) {
    console.error('[learnTopic] synthesis failed:', err instanceof Error ? err.message : err)
    // Non-fatal — index.md already written, synthesis is bonus
  }

  // 5. Promote high-confidence facts as instincts — failures are logged, not fatal
  let instinctsPromoted = 0
  for (const fact of facts) {
    if (fact.confidence < WEB_FACT_CONFIDENCE) continue
    try {
      const outcome = await promoteInstinct({
        kind: 'knowledge',
        title: fact.title,
        body: fact.body,
        confidence: fact.confidence,
        source: `learnTopic:${slug}`,
      })
      if (outcome.promoted) instinctsPromoted++
    } catch (err) {
      console.error(
        '[learnTopic] promoteInstinct failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // 6. Revenue intel scan — append any monetisation signals to REVENUE_INTEL.md
  const REVENUE_KEYWORDS = /affiliate|commission|pricing|revenue|competitor|acquisition|monetiz|earning|profit|cpm|cpc|arpu|ltv|churn|market share/i
  const revenueSignals = facts.filter((f) => REVENUE_KEYWORDS.test(f.title + ' ' + f.body))
  if (revenueSignals.length > 0) {
    try {
      const intelPath = path.join(VAULT_ROOT, 'REVENUE_INTEL.md')
      let existing = ''
      try { existing = await fs.readFile(intelPath, 'utf8') } catch { /* new file */ }
      if (!existing) existing = '# Revenue Intel\n\nSignals surfaced automatically during research.\n\n'
      const dateStr = now().slice(0, 10)
      const block = `\n## ${topic} — ${dateStr}\n` + revenueSignals.map((f) => `- **${f.title}**: ${f.body.slice(0, 300)}`).join('\n') + '\n'
      await fs.appendFile(intelPath, block, 'utf8')
    } catch { /* non-fatal — never block return */ }
  }

  const r = mkReceipt(
    'learnTopic',
    true,
    `topic=${slug} facts=${facts.length} sources=${dedupedResults.length} instincts=${instinctsPromoted} revenue_signals=${revenueSignals.length}`,
  )
  await appendReceipt(r)

  return {
    ok: true,
    result: {
      factsLearned: facts.length,
      topicSlug: slug,
      sourcesSearched: dedupedResults.length,
      instinctsPromoted,
    },
    receipt: r,
  }
}

// ─── Synthesis cache ──────────────────────────────────────────────────────────

interface SynthesisInsightEntry {
  topic: string
  text: string
}

interface SynthesisCache {
  entries: SynthesisInsightEntry[]
  expiresAt: number
}

let _synthesisCache: SynthesisCache | null = null
const SYNTHESIS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Load all Key Insights bullets from every synthesis.md under TOPICS_DIR.
 * Results are cached for 5 minutes so repeated queries don't hammer the filesystem.
 */
async function loadAllSynthesisInsights(): Promise<SynthesisInsightEntry[]> {
  const now = Date.now()
  if (_synthesisCache && now < _synthesisCache.expiresAt) {
    return _synthesisCache.entries
  }

  const entries: SynthesisInsightEntry[] = []

  let topicDirs: string[] = []
  try {
    const dirents = await fs.readdir(TOPICS_DIR, { withFileTypes: true })
    topicDirs = dirents
      .filter((e) => e.isDirectory())
      .map((e) => path.join(TOPICS_DIR, e.name))
  } catch {
    // TOPICS_DIR doesn't exist yet — return empty without caching (let it retry)
    return []
  }

  for (const topicDir of topicDirs) {
    const synthPath = path.join(topicDir, 'synthesis.md')
    let synthContent: string
    try {
      synthContent = await fs.readFile(synthPath, 'utf8')
    } catch {
      continue
    }

    // Derive topic name from frontmatter or directory slug
    const topicMatch = synthContent.match(/^topic:\s*(.+)$/m)
    const topic = topicMatch ? topicMatch[1].trim() : path.basename(topicDir)

    const insightSection = synthContent.match(/## Key Insights\s*\n([\s\S]*?)(?=\n##|$)/)
    if (!insightSection) continue
    const bullets = insightSection[1].match(/^-\s+(.+)$/gm)
    if (!bullets) continue
    for (const bullet of bullets) {
      const text = bullet.replace(/^-\s+/, '').trim()
      if (text) entries.push({ topic, text })
    }
  }

  _synthesisCache = { entries, expiresAt: now + SYNTHESIS_CACHE_TTL_MS }
  return entries
}

// ─── searchKnowledge ───────────────────────────────────────────────────────────

export interface KnowledgeMatch {
  topic: string
  slug: string
  title: string
  body: string
  confidence: number
}

export interface SynthesisInsight {
  topic: string
  text: string
}

export interface SearchKnowledgeResult {
  query: string
  facts: KnowledgeMatch[]
  insights: SynthesisInsight[]
  total: number
  topicsScanned: number
  reranked: boolean
  source: 'knowledge_base'
}

// ─── Gemini re-ranking ────────────────────────────────────────────────────────

/**
 * Re-rank a candidate pool by semantic relevance using Gemini 2.5 Flash.
 * Returns the re-ordered candidate array, or null on any failure/timeout.
 */
async function geminiRerank<T extends { id: string }>(
  query: string,
  candidates: T[],
  apiKey: string,
): Promise<T[] | null> {
  const prompt =
    `Query: ${query}\n\nFacts:\n` +
    candidates
      .map((c) => `ID: ${c.id}\nText: ${ (c as unknown as Record<string, string>)['text'] }`)
      .join('\n---\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'You are a relevance ranker. Given a query and a list of facts, return a JSON array of the most relevant fact IDs in descending order of relevance. Return ONLY the JSON array, no other text.',
          }],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    })

    if (!res.ok) return null

    const data: unknown = await res.json()
    const text = extractGeminiText(data)
    if (!text) return null

    let ids: unknown
    try {
      ids = JSON.parse(text)
    } catch {
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (!m) return null
      try { ids = JSON.parse(m[1]) } catch { return null }
    }

    if (!Array.isArray(ids)) return null

    // Build ordered result — append any candidates whose IDs weren't returned
    const idOrder = ids as string[]
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const ordered: T[] = []
    for (const id of idOrder) {
      const c = byId.get(id)
      if (c) ordered.push(c)
    }
    // Append candidates not mentioned in the re-rank response
    for (const c of candidates) {
      if (!idOrder.includes(c.id)) ordered.push(c)
    }
    return ordered
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function searchKnowledge(raw: unknown): Promise<ToolResult<SearchKnowledgeResult>> {
  const parsed = searchKnowledgeSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('searchKnowledge', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { query, limit } = parsed.data
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

  // List all topic directories
  let topicDirs: string[] = []
  try {
    const entries = await fs.readdir(TOPICS_DIR, { withFileTypes: true })
    topicDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(TOPICS_DIR, e.name))
  } catch {
    // If topics dir doesn't exist yet, return empty results gracefully
    const r = mkReceipt('searchKnowledge', true, 'no topics indexed yet')
    await appendReceipt(r)
    return {
      ok: true,
      result: { query, facts: [], insights: [], total: 0, topicsScanned: 0, reranked: false, source: 'knowledge_base' },
      receipt: r,
    }
  }

  // Scored fact candidates (include id for re-ranking)
  interface ScoredFact extends KnowledgeMatch {
    id: string
    text: string  // combined for re-ranker
    score: number
  }

  const matches: ScoredFact[] = []
  const allInsights: SynthesisInsight[] = []

  for (const topicDir of topicDirs) {
    const indexPath = path.join(topicDir, 'index.md')
    let content: string
    try {
      content = await fs.readFile(indexPath, 'utf8')
    } catch {
      continue // skip unreadable indexes
    }

    const slug = path.basename(topicDir)

    // Extract topic name from frontmatter or slug
    const topicMatch = content.match(/^topic:\s*(.+)$/m)
    const topic = topicMatch ? topicMatch[1].trim() : slug

    // Parse fact lines — format: "N. **title** — body (conf: 0.XX)"
    const factLineRegex = /^\d+\.\s+\*\*(.+?)\*\*\s+—\s+(.+?)\s+\(conf:\s*([\d.]+)\)$/gm
    let match: RegExpExecArray | null
    let factIdx = 0

    while ((match = factLineRegex.exec(content)) !== null) {
      const title = match[1].trim()
      const body = match[2].trim()
      const confidence = parseFloat(match[3])
      const combined = (title + ' ' + body).toLowerCase()
      const score = queryTerms.reduce((acc, term) => acc + (combined.includes(term) ? 1 : 0), 0)

      if (score > 0) {
        matches.push({
          id: `${slug}_fact_${factIdx}`,
          text: combined,
          topic,
          slug,
          title,
          body,
          confidence,
          score,
        })
      }
      factIdx++
    }

    // Read synthesis.md Key Insights if present
    const synthPath = path.join(topicDir, 'synthesis.md')
    try {
      const synthContent = await fs.readFile(synthPath, 'utf8')
      // Extract the Key Insights section — grab bullet lines after the heading
      const insightSection = synthContent.match(/## Key Insights\s*\n([\s\S]*?)(?=\n##|$)/)
      if (insightSection) {
        const bullets = insightSection[1].match(/^-\s+(.+)$/gm)
        if (bullets) {
          for (const bullet of bullets) {
            const text = bullet.replace(/^-\s+/, '').trim()
            if (text) allInsights.push({ topic, text })
          }
        }
      }
    } catch {
      // synthesis.md not present — fine, skip
    }
  }

  // ── Instincts scan ────────────────────────────────────────────────────────
  // Scan instincts/promoted/*.md — the most distilled knowledge in the vault.
  // These are invisible to the topic scan above but often contain the best signal.
  // Boost their score by +1 to surface them ahead of lower-confidence topic facts.
  try {
    const ents = await fs.readdir(INSTINCTS_DIR, { withFileTypes: true })
    const instinctFiles = ents
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join(INSTINCTS_DIR, e.name))

    for (const instinctPath of instinctFiles) {
      let content: string
      try {
        content = await fs.readFile(instinctPath, 'utf8')
      } catch {
        continue
      }

      const slug = path.basename(instinctPath, '.md')
      // Extract title from frontmatter title: or first # heading, else use slug
      const titleMatch = content.match(/^title:\s*(.+)$/m) ?? content.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1].trim() : slug
      // Body = content after frontmatter block (strip --- ... ---)
      const body = content.replace(/^---[\s\S]*?---\s*\n/, '').trim().slice(0, 500)
      const combined = (title + ' ' + body).toLowerCase()
      const score = queryTerms.reduce((acc, term) => acc + (combined.includes(term) ? 1 : 0), 0)

      if (score > 0) {
        matches.push({
          id: `instinct_${slug}`,
          text: combined,
          topic: 'instinct',
          slug,
          title,
          body,
          confidence: 1.0,
          score: score + 1, // Instincts are distilled truth — slight boost
        })
      }
    }
  } catch {
    // instincts/promoted/ may not exist yet — non-fatal
  }

  // Sort by score descending, then confidence
  matches.sort((a, b) => b.score - a.score || b.confidence - a.confidence)

  // Gemini re-rank pass — top 20 candidates when conditions met
  const geminiKey = process.env.GOOGLE_API_KEY
  let wasReranked = false

  if (geminiKey && matches.length > 5) {
    const pool = matches.slice(0, 20)
    const reranked = await geminiRerank(query, pool, geminiKey)
    if (reranked) {
      // Splice re-ranked pool back, keeping tail as-is
      matches.splice(0, pool.length, ...reranked)
      wasReranked = true
    }
  }

  const topFacts = matches.slice(0, limit).map(({ id: _id, text: _text, score: _score, ...rest }) => rest)

  // Deep scan: when the query is complex (>5 words or contains question words),
  // also check ALL synthesis.md files for keyword matches, not just matched topics.
  const QUESTION_WORDS = /\b(what|how|why|when|where|who|which|tell me|explain)\b/i
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
  const isComplexQuery = queryWords.length > 5 || QUESTION_WORDS.test(query)

  if (isComplexQuery) {
    try {
      const allSynthInsights = await loadAllSynthesisInsights()
      const existingInsightTexts = new Set(allInsights.map((i) => i.text))
      for (const insight of allSynthInsights) {
        if (existingInsightTexts.has(insight.text)) continue
        if (queryWords.some((w) => insight.text.toLowerCase().includes(w))) {
          allInsights.push(insight)
          existingInsightTexts.add(insight.text)
        }
      }
    } catch (err) {
      // Non-fatal — deep scan is best-effort
      console.error('[searchKnowledge] deep scan failed:', err instanceof Error ? err.message : err)
    }
  }

  // Filter insights to those from topics that have matching facts, or keyword-matched
  const matchedSlugs = new Set(topFacts.map((f) => f.slug))
  const relevantInsights = allInsights.filter((ins) => {
    if (matchedSlugs.has(slugify(ins.topic))) return true
    const combined = ins.text.toLowerCase()
    return queryTerms.some((term) => combined.includes(term))
  })

  // Tool log line
  const logLine = `[${now()}] searchKnowledge: query="${query.slice(0, 80)}" → ${topFacts.length} facts, ${relevantInsights.length} insights, reranked=${wasReranked}`
  await appendReceipt(logLine)

  const r = mkReceipt(
    'searchKnowledge',
    true,
    `query="${query.slice(0, 60)}" hits=${topFacts.length} insights=${relevantInsights.length} reranked=${wasReranked} scanned=${topicDirs.length}`,
  )
  await appendReceipt(r)

  return {
    ok: true,
    result: {
      query,
      facts: topFacts,
      insights: relevantInsights,
      total: topFacts.length + relevantInsights.length,
      topicsScanned: topicDirs.length,
      reranked: wasReranked,
      source: 'knowledge_base',
    },
    receipt: r,
  }
}
