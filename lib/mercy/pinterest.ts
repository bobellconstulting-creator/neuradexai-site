/**
 * Merit — Pinterest pin automation stub.
 *
 * Pinterest posting requires a browser session (Playwright) and cannot run on
 * Vercel. This module:
 *   1. Generates pin content via Gemini 2.5 Flash
 *   2. Writes pin specs to COG/04-projects/mercy-engine/PINTEREST-QUEUE.md
 *   3. Generates a local-runner script at C:/Users/bobel/social/post_pinterest.mjs
 *      that Bo or Linda can run locally.
 *
 * No Playwright imports here — this is safe to import in Next.js API routes.
 *
 * Env vars:
 *   GOOGLE_API_KEY — Gemini API key (required for pin content generation)
 *   COG_PATH       — Override COG vault root (default C:/Users/bobel/COG)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PinterestPin {
  id: string
  title: string          // max 100 chars
  description: string    // SEO-rich, includes affiliate context
  imagePrompt: string    // for Fireworks SDXL
  destinationUrl: string // affiliate link
  board: string          // e.g. "Best Hunting Gear 2026"
  status: 'queued' | 'posted'
  createdAt: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const GOOGLE_API_KEY  = process.env.GOOGLE_API_KEY ?? ''
const COG_BASE        = process.env.COG_PATH ?? 'C:/Users/bobel/COG'

const QUEUE_PATH      = path.join(COG_BASE, '04-projects', 'mercy-engine', 'PINTEREST-QUEUE.md')
const SCRIPT_PATH     = 'C:/Users/bobel/social/post_pinterest.mjs'
const LINDA_PROFILE   = 'C:/Users/bobel/social/linda-profile'
const GEMINI_URL      = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`

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
        generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
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

// ─── Pin content generation ───────────────────────────────────────────────────

interface PinPayload {
  title: string
  description: string
  imagePrompt: string
  board: string
}

async function generatePinContent(theme: string, affiliateUrl: string): Promise<PinPayload> {
  const prompt = [
    `You are a Pinterest marketing expert for outdoor/hunting gear affiliate content.`,
    `Generate a JSON object for a Pinterest pin about "${theme}".`,
    `Affiliate link: ${affiliateUrl}`,
    `The JSON must have exactly these fields:`,
    `  title (string, max 100 chars, compelling, keyword-rich),`,
    `  description (string, 2-3 sentences, SEO-rich, naturally mentions the product benefit and hunting/outdoor context, does NOT include raw affiliate URLs),`,
    `  imagePrompt (string, detailed Stable Diffusion XL prompt for a cinematic outdoor/hunting photograph related to "${theme}", photorealistic style),`,
    `  board (string, Pinterest board name, e.g. "Best Deer Hunting Gear 2026").`,
    `Respond with ONLY valid JSON, no markdown fences.`,
  ].join('\n')

  const raw = await callGemini(prompt)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err: unknown) {
    throw new Error(`generatePinContent: invalid JSON from Gemini: ${(err as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('generatePinContent: response is not an object')
  }

  const p = parsed as Record<string, unknown>

  if (
    typeof p.title !== 'string' ||
    typeof p.description !== 'string' ||
    typeof p.imagePrompt !== 'string' ||
    typeof p.board !== 'string'
  ) {
    throw new Error('generatePinContent: missing required fields')
  }

  return {
    title: p.title.slice(0, 100),
    description: p.description,
    imagePrompt: p.imagePrompt,
    board: p.board,
  }
}

// ─── Queue file helpers ───────────────────────────────────────────────────────

async function appendToQueue(pin: PinterestPin): Promise<void> {
  await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true })

  let existing = ''
  try {
    existing = await fs.readFile(QUEUE_PATH, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    existing = '# Merit — Pinterest Pin Queue\n\nRun `node post_pinterest.mjs` locally to post these.\n\n'
  }

  const entry = [
    `## ${pin.title}`,
    `- **ID:** ${pin.id}`,
    `- **Board:** ${pin.board}`,
    `- **Status:** ${pin.status}`,
    `- **Destination:** ${pin.destinationUrl}`,
    `- **Created:** ${pin.createdAt}`,
    ``,
    `**Description:**`,
    pin.description,
    ``,
    `**Image Prompt:**`,
    pin.imagePrompt,
    ``,
    `---`,
    ``,
  ].join('\n')

  await fs.writeFile(QUEUE_PATH, existing + entry, 'utf8')
}

// ─── Script generation ────────────────────────────────────────────────────────

function buildPinterestScript(pins: PinterestPin[]): string {
  const pinJson = JSON.stringify(pins, null, 2)

  return `#!/usr/bin/env node
// Post queued Merit pins to Pinterest via Playwright using Linda's Chrome profile.
// One-time setup: run login_helper.cmd, log into pinterest.com, close. Autonomous after.
//
// Usage:
//   node post_pinterest.mjs                  # post all queued pins
//   node post_pinterest.mjs --dry-run        # preview only
//   node post_pinterest.mjs --id <pin-id>    # post single pin by id
import { chromium } from "patchright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const idIdx = args.indexOf("--id");
const targetId = idIdx !== -1 ? args[idIdx + 1] : null;

const USER_DATA_DIR = ${JSON.stringify(LINDA_PROFILE)};
if (!fs.existsSync(USER_DATA_DIR)) {
  console.error("FAIL profile missing — run login_helper.cmd once for pinterest.com");
  process.exit(3);
}

const PINS = ${pinJson};

const toPost = targetId ? PINS.filter(p => p.id === targetId) : PINS.filter(p => p.status === "queued");

if (toPost.length === 0) {
  console.log("No queued pins to post.");
  process.exit(0);
}

if (dryRun) {
  for (const pin of toPost) {
    console.log(\`DRYRUN would post: \${pin.title.slice(0, 60)} → \${pin.board}\`);
  }
  process.exit(0);
}

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: true,
  channel: "chrome",
  viewport: { width: 1280, height: 900 },
  args: ["--disable-blink-features=AutomationControlled"],
});

const page = ctx.pages()[0] || await ctx.newPage();

for (const pin of toPost) {
  try {
    await page.goto("https://www.pinterest.com/pin-creation-tool/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    if (await page.$('a[href*="/login"]')) {
      throw new Error("not logged into Pinterest — re-run login_helper.cmd");
    }

    // Fill destination URL
    const urlInput = page.locator('[data-test-id="draft-destination-url"] input, input[placeholder*="destination"], input[placeholder*="link"]').first();
    await urlInput.waitFor({ state: "visible", timeout: 20000 });
    await urlInput.fill(pin.destinationUrl);

    // Fill title
    const titleInput = page.locator('[data-test-id="draft-title"] input, input[placeholder*="title"]').first();
    await titleInput.waitFor({ state: "visible", timeout: 10000 });
    await titleInput.fill(pin.title);

    // Fill description
    const descInput = page.locator('[data-test-id="draft-description"] textarea, textarea[placeholder*="description"]').first();
    await descInput.waitFor({ state: "visible", timeout: 10000 });
    await descInput.fill(pin.description);

    // Select board
    const boardBtn = page.locator('[data-test-id="board-dropdown-select-button"]').first();
    await boardBtn.click();
    await page.waitForTimeout(1000);
    const boardSearch = page.locator('[data-test-id="board-search-input"] input').first();
    await boardSearch.fill(pin.board);
    await page.waitForTimeout(1000);
    const boardOption = page.locator(\`[data-test-id*="board-option"]:has-text("\${pin.board}")\`).first();
    const optionVisible = await boardOption.isVisible().catch(() => false);
    if (optionVisible) {
      await boardOption.click();
    } else {
      console.warn(\`[WARN] Board "\${pin.board}" not found — posting without board selection\`);
      await page.keyboard.press("Escape");
    }

    // Publish
    const publishBtn = page.locator('[data-test-id="board-dropdown-save-button"], button:has-text("Publish")').first();
    await publishBtn.waitFor({ state: "visible", timeout: 15000 });
    await publishBtn.click();
    await page.waitForTimeout(5000);

    console.log(\`OK posted: \${pin.title.slice(0, 60)}\`);
  } catch (e) {
    console.error(\`FAIL pin \${pin.id}: \${e.message}\`);
    try {
      const outDir = path.join("C:/Users/bobel/social/out");
      fs.mkdirSync(outDir, { recursive: true });
      await page.screenshot({ path: path.join(outDir, \`pinterest-fail-\${Date.now()}.png\`) });
    } catch {}
  }
}

await ctx.close();
`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function queuePinterestPin(
  theme: string,
  affiliateUrl: string,
): Promise<PinterestPin> {
  const id = randomUUID()
  const createdAt = new Date().toISOString()

  const payload = await generatePinContent(theme, affiliateUrl)

  const pin: PinterestPin = {
    id,
    title: payload.title,
    description: payload.description,
    imagePrompt: payload.imagePrompt,
    destinationUrl: affiliateUrl,
    board: payload.board,
    status: 'queued',
    createdAt,
  }

  await appendToQueue(pin)
  return pin
}

export async function generatePinterestScript(): Promise<string> {
  // Read the current queue and embed queued pins into the script
  let queuedPins: PinterestPin[] = []

  try {
    const raw = await fs.readFile(QUEUE_PATH, 'utf8')
    // Extract pin IDs from the queue markdown to build pin list
    // Each entry has "- **ID:** <uuid>" — extract all IDs and rebuild minimal objects
    // Since we don't store full structured data in the md, we embed what we have
    const idMatches = [...raw.matchAll(/\*\*ID:\*\* ([a-f0-9-]{36})/g)]
    const titleMatches = [...raw.matchAll(/## (.+)/g)]
    const urlMatches = [...raw.matchAll(/\*\*Destination:\*\* (.+)/g)]
    const boardMatches = [...raw.matchAll(/\*\*Board:\*\* (.+)/g)]
    const statusMatches = [...raw.matchAll(/\*\*Status:\*\* (queued|posted)/g)]
    const createdMatches = [...raw.matchAll(/\*\*Created:\*\* (.+)/g)]
    const descMatches = [...raw.matchAll(/\*\*Description:\*\*\n([\s\S]+?)\n\n\*\*Image/g)]
    const imgMatches = [...raw.matchAll(/\*\*Image Prompt:\*\*\n([\s\S]+?)\n\n---/g)]

    for (let i = 0; i < idMatches.length; i++) {
      const pin: PinterestPin = {
        id: idMatches[i]?.[1] ?? randomUUID(),
        title: titleMatches[i]?.[1]?.trim() ?? '',
        description: descMatches[i]?.[1]?.trim() ?? '',
        imagePrompt: imgMatches[i]?.[1]?.trim() ?? '',
        destinationUrl: urlMatches[i]?.[1]?.trim() ?? '',
        board: boardMatches[i]?.[1]?.trim() ?? '',
        status: (statusMatches[i]?.[1] ?? 'queued') as 'queued' | 'posted',
        createdAt: createdMatches[i]?.[1]?.trim() ?? new Date().toISOString(),
      }
      queuedPins = [...queuedPins, pin]
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    // No queue file yet — generate an empty script
  }

  const scriptContent = buildPinterestScript(queuedPins)

  try {
    await fs.mkdir(path.dirname(SCRIPT_PATH), { recursive: true })
    await fs.writeFile(SCRIPT_PATH, scriptContent, 'utf8')
  } catch (err: unknown) {
    throw new Error(`generatePinterestScript: failed to write script: ${(err as Error).message}`)
  }

  return SCRIPT_PATH
}
