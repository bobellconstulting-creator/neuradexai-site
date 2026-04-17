/**
 * Merit design pipeline — prompt → image → Printify draft.
 *
 * Flow:
 *   1. Spawn gen_image.mjs (NVIDIA → Gemini → local) to generate PNG
 *   2. Upload PNG to Printify Images API (base64)
 *   3. Fetch variants for blueprint/provider combo
 *   4. POST draft product to Printify
 *
 * Returns productId + printifyUrl for Bo's review before publishing.
 *
 * Env vars:
 *   PRINTIFY_API_KEY  — Printify personal access token
 *   PRINTIFY_SHOP_ID  — Printify shop ID
 */
import { spawn }     from 'node:child_process'
import { promises as fs } from 'node:fs'
import path          from 'node:path'
import type { NicheIdea } from './niche-research'

// ─── Config ───────────────────────────────────────────────────────────────────

const PRINTIFY_BASE = 'https://api.printify.com/v1'
const GEN_IMAGE_MJS = 'C:/Users/bobel/social/gen_image.mjs'

// Blueprint → provider + price defaults
const PRODUCT_DEFAULTS: Record<
  'tshirt' | 'mug' | 'poster' | 'hoodie',
  { blueprintId: number; printProviderId: number; retailCents: number }
> = {
  tshirt: { blueprintId: 5,   printProviderId: 99, retailCents: 2499 },
  mug:    { blueprintId: 77,  printProviderId: 99, retailCents: 1699 },
  poster: { blueprintId: 446, printProviderId: 99, retailCents: 1999 },
  hoodie: { blueprintId: 92,  printProviderId: 99, retailCents: 3999 },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrintifyVariant {
  id: number
  is_enabled: boolean
  price: number
}

interface PrintifyImageUploadResponse {
  id: string
  url: string
}

interface PrintifyProductResponse {
  id: string | number
}

// ─── Image generation ─────────────────────────────────────────────────────────

export async function generateDesignImage(prompt: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      GEN_IMAGE_MJS,
      '--prompt', prompt,
      '--out',    outputPath,
      '--force',
    ])

    const stdout: string[] = []
    const stderr: string[] = []

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `gen_image.mjs exited ${code}: ${stderr.join('').slice(0, 300)}`,
          ),
        )
        return
      }

      // gen_image.mjs prints: JSON line, then final path line
      const lines = stdout.join('').trim().split('\n').filter(Boolean)
      // Last non-JSON line is the path
      const lastLine = lines[lines.length - 1]?.trim() ?? ''
      if (lastLine && !lastLine.startsWith('{')) {
        resolve(lastLine)
        return
      }
      // Fallback: parse first JSON line for path field
      try {
        const payload = JSON.parse(lines[0] ?? '{}') as { ok: boolean; path?: string; error?: string }
        if (payload.ok && payload.path) {
          resolve(payload.path)
          return
        }
        reject(new Error(`gen_image.mjs reported failure: ${payload.error ?? 'unknown'}`))
      } catch {
        reject(new Error(`gen_image.mjs: cannot parse stdout: ${lines.join(' | ').slice(0, 200)}`))
      }
    })

    child.on('error', (err) => reject(new Error(`spawn gen_image.mjs: ${err.message}`)))
  })
}

// ─── Printify upload ──────────────────────────────────────────────────────────

export async function uploadDesignToPrintify(
  imagePath: string,
  fileName: string,
): Promise<{ id: string; url: string }> {
  const apiKey = process.env.PRINTIFY_API_KEY
  if (!apiKey) throw new Error('uploadDesignToPrintify: PRINTIFY_API_KEY not set')

  const imageBuffer = await fs.readFile(imagePath)
  const base64      = imageBuffer.toString('base64')

  const res = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ file_name: fileName, contents: base64 }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`Printify image upload HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as PrintifyImageUploadResponse
  return { id: data.id, url: data.url }
}

// ─── Variant fetch ────────────────────────────────────────────────────────────

async function fetchVariants(
  blueprintId: number,
  providerId: number,
  retailCents: number,
  apiKey: string,
): Promise<PrintifyVariant[]> {
  const url = `${PRINTIFY_BASE}/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`Printify variant fetch HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as { variants?: Array<{ id: number }> }
  const variants = data.variants ?? []

  // Take first 12 (covers S/M/L/XL in 2-3 colors)
  return variants.slice(0, 12).map((v) => ({
    id: v.id,
    is_enabled: true,
    price: retailCents,
  }))
}

// ─── Printify draft product ───────────────────────────────────────────────────

export async function createPrintifyDraft(opts: {
  title: string
  description: string
  tags: string[]
  productType: 'tshirt' | 'mug' | 'poster' | 'hoodie'
  printifyImageId: string
}): Promise<{ productId: string; printifyUrl: string }> {
  const apiKey = process.env.PRINTIFY_API_KEY
  const shopId = process.env.PRINTIFY_SHOP_ID
  if (!apiKey || !shopId) throw new Error('createPrintifyDraft: PRINTIFY_API_KEY / PRINTIFY_SHOP_ID not set')

  const { blueprintId, printProviderId, retailCents } = PRODUCT_DEFAULTS[opts.productType]
  const variants = await fetchVariants(blueprintId, printProviderId, retailCents, apiKey)

  const payload = {
    title:            opts.title,
    description:      opts.description,
    tags:             opts.tags.slice(0, 13),
    blueprint_id:     blueprintId,
    print_provider_id: printProviderId,
    variants,
    print_areas: [
      {
        variant_ids: variants.map((v) => v.id),
        placeholders: [
          {
            position: 'front',
            images: [
              {
                id:       opts.printifyImageId,
                x:        0.5,
                y:        0.5,
                scale:    1,
                angle:    0,
              },
            ],
          },
        ],
      },
    ],
  }

  const res = await fetch(`${PRINTIFY_BASE}/shops/${shopId}/products.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`createPrintifyDraft HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as PrintifyProductResponse
  const productId = String(data.id)
  const printifyUrl = `https://printify.com/app/store/${shopId}/products/${productId}`

  return { productId, printifyUrl }
}

// ─── Public pipeline ──────────────────────────────────────────────────────────

export async function runDesignPipeline(niche: NicheIdea): Promise<{
  productId: string
  printifyUrl: string
  imageLocalPath: string
}> {
  const productType = niche.productTypes[0] ?? 'tshirt'
  const safeNiche   = niche.niche.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)
  const outputPath  = path.join(
    process.env.COG_PATH ?? 'C:/Users/bobel/COG',
    '04-projects',
    'mercy-engine',
    'designs',
    `${safeNiche}-${Date.now()}.png`,
  )

  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  // 1. Generate image
  const imageLocalPath = await generateDesignImage(niche.designPrompt, outputPath)

  // 2. Upload to Printify
  const fileName = path.basename(imageLocalPath)
  const { id: printifyImageId } = await uploadDesignToPrintify(imageLocalPath, fileName)

  // 3. Create draft product
  const title       = niche.niche.slice(0, 255)
  const description = `${niche.niche} — ${niche.digitalProductIdea}`
  const tags        = niche.keywords.slice(0, 13)

  const { productId, printifyUrl } = await createPrintifyDraft({
    title,
    description,
    tags,
    productType,
    printifyImageId,
  })

  return { productId, printifyUrl, imageLocalPath }
}
