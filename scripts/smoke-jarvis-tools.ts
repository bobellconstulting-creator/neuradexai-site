/* eslint-disable no-console */
// Smoke tests for lib/jarvis/tools.ts. Run with:
//   npx tsx scripts/smoke-jarvis-tools.mts
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  shellExec,
  generateImage,
  postToX,
  postToTikTok,
  JARVIS_TOOLS,
} from '../lib/jarvis/tools'

async function main(): Promise<void> {
  const results: Record<string, unknown> = {}

  console.log('=== TEST 1: shellExec echo hello ===')
  const t1 = await shellExec({ command: 'echo hello' })
  results.shellExec = t1
  console.log('shellExec →', JSON.stringify({ ok: t1.ok, stdout: t1.result && (t1.result as { stdout: string }).stdout, receipt: t1.receipt }, null, 2))

  console.log('\n=== TEST 2: generateImage (Fireworks SDXL) ===')
  const outDir = 'C:/Users/bobel/social/out'
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `smoke-${Date.now()}.png`)
  const t2 = await generateImage({ prompt: 'a minimalist neon jarvis hud orb, test smoke', outPath })
  console.log('generateImage →', JSON.stringify({ ok: t2.ok, receipt: t2.receipt, outPath: t2.result && (t2.result as { outPath: string }).outPath, error: t2.error }, null, 2))
  if (t2.ok && t2.result) {
    const r = t2.result as { outPath: string }
    try {
      const st = await fs.stat(r.outPath)
      console.log(`generateImage: file exists, bytes=${st.size}`)
    } catch (e) {
      console.log('generateImage: file NOT found!', e)
    }
  }
  results.generateImage = t2

  console.log('\n=== TEST 3: postToX dry-run ===')
  const t3 = await postToX({ text: 'smoke test tweet (dry-run, not posted)', dryRun: true })
  console.log('postToX dry-run →', JSON.stringify({ ok: t3.ok, stdout: t3.result && (t3.result as { stdout: string }).stdout, receipt: t3.receipt, error: t3.error }, null, 2))
  results.postToX = t3

  console.log('\n=== TEST 4: postToTikTok dry-run ===')
  // Need a file that exists so the argv check passes. Reuse the gen_image output if we got one.
  const fakeVideo = (results.generateImage as { ok: boolean; result?: { outPath: string } }).ok
    ? (results.generateImage as { result: { outPath: string } }).result.outPath
    : 'C:/Users/bobel/social/gen_image.mjs' // any existing file works for dry-run

  const t4 = await postToTikTok({ videoPath: fakeVideo, caption: 'smoke dry-run', dryRun: true })
  console.log('postToTikTok dry-run →', JSON.stringify({ ok: t4.ok, stdout: t4.result && (t4.result as { stdout: string }).stdout, receipt: t4.receipt, error: t4.error }, null, 2))
  results.postToTikTok = t4

  console.log('\n=== TEST 5: browserLogin + createAccount code-load check (no execution) ===')
  console.log('Tools registered:', Object.keys(JARVIS_TOOLS).join(', '))
  try {
    // Just attempt to resolve the playwright import so we confirm it's on disk.
    await import('playwright')
    console.log('playwright import: OK')
  } catch (e) {
    console.log('playwright import: FAIL —', e instanceof Error ? e.message : String(e))
  }

  console.log('\n=== SUMMARY ===')
  for (const [k, v] of Object.entries(results)) {
    const r = v as { ok: boolean; error?: string }
    console.log(`${k}: ${r.ok ? 'PASS' : 'FAIL'}${r.error ? ' — ' + r.error : ''}`)
  }
}

main().catch((e) => {
  console.error('smoke test crashed:', e)
  process.exit(1)
})
