/**
 * Merit — Digital download product generator.
 *
 * Uses Gemini 2.5 Flash to generate content for digital products, then writes
 * the file to disk. If ETSY_API_KEY is present, publishes directly; otherwise
 * writes a draft to COG/04-projects/mercy-engine/DIGITAL-DRAFTS.md and logs a
 * [GATE] line so Bo knows what needs a key to go live.
 *
 * Env vars:
 *   GOOGLE_API_KEY   — Gemini API key (required)
 *   ETSY_API_KEY     — Etsy v3 API key (optional; enables auto-publish)
 *   COG_PATH         — Override COG vault root (default C:/Users/bobel/COG)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigitalProduct {
  id: string
  title: string
  description: string
  tags: string[]         // max 13
  price: number          // cents
  category: 'prompt-pack' | 'planner' | 'template' | 'checklist'
  fileName: string
  filePath: string
  etsyListingId?: string
  status: 'draft' | 'pending-review' | 'live'
  createdAt: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? ''
const ETSY_API_KEY   = process.env.ETSY_API_KEY ?? ''
const COG_BASE       = process.env.COG_PATH ?? 'C:/Users/bobel/COG'

const OUTPUT_DIR     = 'C:/Users/bobel/social/out/digital'
const DRAFTS_PATH    = path.join(COG_BASE, '04-projects', 'mercy-engine', 'DIGITAL-DRAFTS.md')
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`

// ─── Gemini helpers ───────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
}

async function callGemini(prompt: string): Promise<string> {
  if (!GOOGLE_API_KEY) {
    throw new Error('callGemini: GOOGLE_API_KEY is not set')
  }

  let response: Response
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      }),
    })
  } catch (err: unknown) {
    throw new Error(`callGemini: network error: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)')
    throw new Error(`callGemini: API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as GeminiResponse
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) {
    throw new Error('callGemini: empty response from Gemini')
  }
  return text.trim()
}

// ─── Content generation per category ─────────────────────────────────────────

function buildPrompt(category: DigitalProduct['category'], theme: string): string {
  switch (category) {
    case 'prompt-pack':
      return [
        `You are an expert Etsy seller of AI art prompt packs for outdoor/hunting enthusiasts.`,
        `Generate a JSON object for a digital download product about "${theme}".`,
        `The JSON must have exactly these fields:`,
        `  title (string, max 140 chars, Etsy listing title),`,
        `  description (string, 3-4 paragraphs, Etsy listing description with keywords),`,
        `  tags (array of 13 strings, lowercase, Etsy search tags),`,
        `  price (integer, cents, between 299 and 799),`,
        `  prompts (array of 50 strings, each a detailed AI art prompt related to "${theme}").`,
        `Respond with ONLY valid JSON, no markdown fences.`,
      ].join('\n')

    case 'planner':
      return [
        `You are an expert Etsy seller of printable planners for hunters and outdoor enthusiasts.`,
        `Generate a JSON object for a digital download planner product about "${theme}".`,
        `The JSON must have exactly these fields:`,
        `  title (string, max 140 chars, Etsy listing title),`,
        `  description (string, 3-4 paragraphs, Etsy listing description with keywords),`,
        `  tags (array of 13 strings, lowercase, Etsy search tags),`,
        `  price (integer, cents, between 399 and 999),`,
        `  content (string, complete markdown-formatted planner content with sections, tables, and checklists for "${theme}").`,
        `Respond with ONLY valid JSON, no markdown fences.`,
      ].join('\n')

    case 'template':
      return [
        `You are an expert Etsy seller of digital templates for hunters and outdoor enthusiasts.`,
        `Generate a JSON object for a digital download template product about "${theme}".`,
        `The JSON must have exactly these fields:`,
        `  title (string, max 140 chars, Etsy listing title),`,
        `  description (string, 3-4 paragraphs, Etsy listing description with keywords),`,
        `  tags (array of 13 strings, lowercase, Etsy search tags),`,
        `  price (integer, cents, between 299 and 699),`,
        `  content (string, complete template with instructions for customizing in Notion or Canva, themed around "${theme}").`,
        `Respond with ONLY valid JSON, no markdown fences.`,
      ].join('\n')

    case 'checklist':
      return [
        `You are an expert Etsy seller of printable checklists for hunters and outdoor enthusiasts.`,
        `Generate a JSON object for a digital download checklist product about "${theme}".`,
        `The JSON must have exactly these fields:`,
        `  title (string, max 140 chars, Etsy listing title),`,
        `  description (string, 3-4 paragraphs, Etsy listing description with keywords),`,
        `  tags (array of 13 strings, lowercase, Etsy search tags),`,
        `  price (integer, cents, between 199 and 499),`,
        `  content (string, complete markdown checklist with multiple sections, themed around "${theme}").`,
        `Respond with ONLY valid JSON, no markdown fences.`,
      ].join('\n')
  }
}

interface GeminiProductPayload {
  title: string
  description: string
  tags: string[]
  price: number
  content?: string
  prompts?: string[]
}

function parseGeminiProduct(raw: string): GeminiProductPayload {
  // Strip any accidental markdown fences before parsing
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err: unknown) {
    throw new Error(`parseGeminiProduct: invalid JSON from Gemini: ${(err as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('parseGeminiProduct: response is not an object')
  }

  const p = parsed as Record<string, unknown>

  if (typeof p.title !== 'string' || typeof p.description !== 'string' || !Array.isArray(p.tags) || typeof p.price !== 'number') {
    throw new Error('parseGeminiProduct: missing required fields (title, description, tags, price)')
  }

  return {
    title: p.title.slice(0, 140),
    description: p.description,
    tags: (p.tags as unknown[]).slice(0, 13).map(t => String(t).toLowerCase().trim()),
    price: Math.round(p.price),
    content: typeof p.content === 'string' ? p.content : undefined,
    prompts: Array.isArray(p.prompts) ? (p.prompts as unknown[]).map(String) : undefined,
  }
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
}

async function writeProductFile(
  category: DigitalProduct['category'],
  payload: GeminiProductPayload,
  timestamp: string,
): Promise<{ fileName: string; filePath: string }> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const slug = slugify(payload.title)
  const fileName = `${timestamp}-${slug}.txt`
  const filePath = path.join(OUTPUT_DIR, fileName)

  let fileContent: string
  if (category === 'prompt-pack' && payload.prompts) {
    fileContent = JSON.stringify({ title: payload.title, prompts: payload.prompts }, null, 2)
  } else {
    fileContent = [
      `# ${payload.title}`,
      '',
      payload.content ?? payload.description,
    ].join('\n')
  }

  await fs.writeFile(filePath, fileContent, 'utf8')
  return { fileName, filePath }
}

// ─── COG draft fallback ───────────────────────────────────────────────────────

async function appendToDrafts(product: DigitalProduct): Promise<void> {
  await fs.mkdir(path.dirname(DRAFTS_PATH), { recursive: true })

  let existing = ''
  try {
    existing = await fs.readFile(DRAFTS_PATH, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    existing = '# Merit — Digital Product Drafts\n\nManually publish these to Etsy. Add ETSY_API_KEY to env to auto-publish.\n\n'
  }

  const entry = [
    `## ${product.title}`,
    `- **ID:** ${product.id}`,
    `- **Category:** ${product.category}`,
    `- **Price:** $${(product.price / 100).toFixed(2)}`,
    `- **File:** ${product.filePath}`,
    `- **Tags:** ${product.tags.join(', ')}`,
    `- **Status:** ${product.status}`,
    `- **Created:** ${product.createdAt}`,
    ``,
    product.description,
    ``,
    `---`,
    ``,
  ].join('\n')

  await fs.writeFile(DRAFTS_PATH, existing + entry, 'utf8')
}

// ─── Etsy API helpers ─────────────────────────────────────────────────────────

interface EtsyListingResponse {
  listing_id?: number
}

async function publishToEtsy(product: DigitalProduct): Promise<string> {
  // Etsy v3 create listing endpoint
  const url = 'https://openapi.etsy.com/v3/application/shops/me/listings'

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ETSY_API_KEY,
      },
      body: JSON.stringify({
        title: product.title,
        description: product.description,
        price: { amount: product.price, divisor: 100, currency_code: 'USD' },
        quantity: 999,
        who_made: 'i_did',
        when_made: 'made_to_order',
        taxonomy_id: 2078,  // Digital downloads > Other digital files
        type: 'download',
        tags: product.tags,
        state: 'draft',     // publish as draft so Bo can review before activating
      }),
    })
  } catch (err: unknown) {
    throw new Error(`publishToEtsy: network error: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)')
    throw new Error(`publishToEtsy: Etsy API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as EtsyListingResponse
  if (!data.listing_id) {
    throw new Error('publishToEtsy: no listing_id in Etsy response')
  }
  return String(data.listing_id)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateDigitalProduct(
  category: DigitalProduct['category'],
  theme: string,
): Promise<DigitalProduct> {
  const id = randomUUID()
  const timestamp = Date.now().toString()
  const createdAt = new Date().toISOString()

  // 1. Generate content via Gemini
  const prompt = buildPrompt(category, theme)
  const rawResponse = await callGemini(prompt)
  const payload = parseGeminiProduct(rawResponse)

  // 2. Write product file to disk
  const { fileName, filePath } = await writeProductFile(category, payload, timestamp)

  const product: DigitalProduct = {
    id,
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    price: payload.price,
    category,
    fileName,
    filePath,
    status: 'draft',
    createdAt,
  }

  // 3. Publish to Etsy if key present; otherwise write COG draft
  if (ETSY_API_KEY) {
    try {
      const listingId = await publishToEtsy(product)
      return { ...product, etsyListingId: listingId, status: 'live' }
    } catch (err: unknown) {
      // Publishing failed — fall through to draft fallback
      console.error(`[WARN] Etsy publish failed: ${(err as Error).message}. Writing draft to COG.`)
    }
  } else {
    console.log(`[GATE] Ready to publish: ${product.title} — add ETSY_API_KEY to env to auto-publish.`)
  }

  const draftProduct: DigitalProduct = { ...product, status: 'pending-review' }
  await appendToDrafts(draftProduct)
  return draftProduct
}
