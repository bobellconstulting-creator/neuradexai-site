/**
 * Jarvis Etsy/Printify tool — createEtsyListing
 *
 * Creates a DRAFT product listing via Printify API (free tier).
 * Draft = not published, Bo reviews before it goes live.
 *
 * Free-first: Printify API is free. dryRun guard prevents accidental posts.
 *
 * Env vars required:
 *   PRINTIFY_API_KEY  — Printify personal access token
 *   PRINTIFY_SHOP_ID  — Printify shop ID (find in Printify dashboard URL)
 */
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ToolResult } from './tools'

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'
const PRINTIFY_BASE = 'https://api.printify.com/v1'

// Blueprint IDs (hardcoded per spec)
const BLUEPRINT_IDS: Record<string, number> = {
  tshirt: 5,   // Unisex Gildan 64000
  mug: 77,     // White Mug 11oz
  poster: 446, // Matte Poster
  hoodie: 92,  // Gildan 18500
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export const createEtsyListingSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  tags: z.array(z.string().min(1)).min(1).max(13),
  productType: z.enum(['tshirt', 'mug', 'poster', 'hoodie']),
  imageUrl: z.string().url().optional(),
  dryRun: z.boolean().optional().default(false),
})
export type CreateEtsyListingArgs = z.infer<typeof createEtsyListingSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(ok: boolean, detail: string): string {
  return `[${now()}] createEtsyListing ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Receipt sink must never break the caller.
  }
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface CreateEtsyListingResult {
  productId: string | null
  title: string
  printifyUrl: string | null
  dryRun: boolean
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function createEtsyListing(
  raw: unknown,
): Promise<ToolResult<CreateEtsyListingResult>> {
  const parsed = createEtsyListingSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt(false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { title, description, tags, productType, imageUrl, dryRun } = parsed.data
  const apiKey = process.env.PRINTIFY_API_KEY
  const shopId = process.env.PRINTIFY_SHOP_ID

  if (!apiKey || !shopId) {
    const missing = [!apiKey && 'PRINTIFY_API_KEY', !shopId && 'PRINTIFY_SHOP_ID']
      .filter(Boolean)
      .join(', ')
    const r = mkReceipt(false, `missing env: ${missing}`)
    await appendReceipt(r)
    return {
      ok: false,
      error: `Printify not configured — set ${missing} env vars`,
      receipt: r,
    }
  }

  const blueprintId = BLUEPRINT_IDS[productType]

  // Build the Printify product payload.
  // images array is optional — Printify allows a product with no images (draft).
  const payload: Record<string, unknown> = {
    title,
    description,
    tags,
    blueprint_id: blueprintId,
    variants: [],  // empty = draft; Bo adds variants in Printify UI before publishing
    print_areas: [],
    is_locked: false,
  }

  if (imageUrl) {
    payload.images = [{ src: imageUrl, position: 'front', is_default: true }]
  }

  if (dryRun) {
    const r = mkReceipt(true, `dryRun title="${title.slice(0, 60)}" type=${productType}`)
    await appendReceipt(r)
    return {
      ok: true,
      result: { productId: null, title, printifyUrl: null, dryRun: true },
      receipt: r,
    }
  }

  try {
    const res = await fetch(`${PRINTIFY_BASE}/shops/${shopId}/products.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)')
      const msg = `Printify HTTP ${res.status}: ${errText.slice(0, 200)}`
      const r = mkReceipt(false, msg)
      await appendReceipt(r)
      return { ok: false, error: msg, receipt: r }
    }

    const data = (await res.json()) as Record<string, unknown>
    const productId = typeof data.id === 'string' ? data.id : String(data.id ?? '')
    const printifyUrl = productId
      ? `https://printify.com/app/store/${shopId}/products/${productId}`
      : null

    const r = mkReceipt(true, `productId=${productId} title="${title.slice(0, 60)}"`)
    await appendReceipt(r)
    return {
      ok: true,
      result: { productId, title, printifyUrl, dryRun: false },
      receipt: r,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt(false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}
