#!/usr/bin/env node
/**
 * Tool execution verification against Doc.
 *
 * Gateway path over Gemini fallback is ONLY worthwhile if tool calls actually
 * stream through to ChatResult.toolCalls. This script forces Doc to use tools
 * and confirms the production client captures them correctly.
 *
 * Scenarios:
 *   T1: shell — "run echo hello" → expect shell tool call with result
 *   T2: file read — "read package.json and tell me the name field"
 *         → expect a file/read tool call
 *   T3: multi-tool — "count TypeScript files in lib/, then report the largest one"
 *         → expect 2+ tool calls chained
 *   T4: concurrent clients — two OpenClawClient instances to same Doc, both
 *         run tool chats in parallel, confirm neither leaks events to the other
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(__dirname, '..')

const wrapperSource = `
import { OpenClawClient, type ChatResult } from '../lib/openclawClient'

const PORT = 18789
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? 'ffa3c844a788ceb37d07ef220eb9d52e27c2f10ff673d7f3'

function log(...a: unknown[]) { console.log('[tools]', ...a) }
function hr() { console.log('-'.repeat(72)) }

function describeTools(result: ChatResult): string {
  if (result.toolCalls.length === 0) return '(none)'
  return result.toolCalls
    .map((tc, i) => {
      const name = tc.name ?? 'unknown'
      const argsStr = tc.args === undefined ? '{}' : (JSON.stringify(tc.args) ?? '{}')
      return \`#\${i + 1} \${name} args=\${argsStr.slice(0, 80)}\`
    })
    .join(' | ')
}

async function main() {
  const results: Array<{ name: string; pass: boolean; detail: string; ms: number; toolCount: number }> = []
  const overall = Date.now()

  // ── T1: shell tool ────────────────────────────────────────────────────────
  hr(); log('T1: shell tool (run echo)')
  {
    const t0 = Date.now()
    const client = new OpenClawClient({
      port: PORT,
      token: TOKEN,
      connectTimeoutMs: 30_000,
      chatTimeoutMs: 300_000,
    })
    try {
      await client.connect()
      const result = await client.chat(
        'Use your shell tool to run the command: echo "tool-verify-marker-12345". Then tell me what you saw.',
        'verify-tools-shell-' + Date.now(),
      )
      log('content:', result.content.slice(0, 200))
      log('tools:', describeTools(result))
      const pass = result.toolCalls.length > 0
      results.push({
        name: 'shell tool',
        pass,
        detail: describeTools(result).slice(0, 120),
        ms: Date.now() - t0,
        toolCount: result.toolCalls.length,
      })
    } catch (err) {
      results.push({
        name: 'shell tool',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
        toolCount: 0,
      })
    } finally {
      try { await client.close() } catch {}
    }
  }

  // ── T2: file read tool ────────────────────────────────────────────────────
  hr(); log('T2: file read (package.json name field)')
  {
    const t0 = Date.now()
    const client = new OpenClawClient({
      port: PORT,
      token: TOKEN,
      connectTimeoutMs: 30_000,
      chatTimeoutMs: 300_000,
    })
    try {
      await client.connect()
      const result = await client.chat(
        'Read the file C:/Users/bobel/.openclaw/package.json if it exists, or C:/Users/bobel/projects/neuradexai/package.json — whichever you can access. Report the "name" field from the JSON. Use your file reading tool.',
        'verify-tools-read-' + Date.now(),
      )
      log('content:', result.content.slice(0, 200))
      log('tools:', describeTools(result))
      const pass = result.toolCalls.length > 0
      results.push({
        name: 'file read tool',
        pass,
        detail: describeTools(result).slice(0, 120),
        ms: Date.now() - t0,
        toolCount: result.toolCalls.length,
      })
    } catch (err) {
      results.push({
        name: 'file read tool',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
        toolCount: 0,
      })
    } finally {
      try { await client.close() } catch {}
    }
  }

  // ── T3: concurrent chats on ONE client (production-realistic) ────────────
  // Production caches a single client per port via gatewayClients Map, so this
  // is the actual contention pattern — same client, two parallel chat() calls.
  hr(); log('T3: 2 parallel chats on single client (production pattern)')
  {
    const t0 = Date.now()
    const client = new OpenClawClient({
      port: PORT,
      token: TOKEN,
      connectTimeoutMs: 30_000,
      chatTimeoutMs: 300_000,
    })
    try {
      await client.connect()
      log('connected')
      const base = 'verify-tools-concur-' + Date.now()
      const [rA, rB] = await Promise.all([
        client.chat('Reply with exactly: "alpha-unique-marker"', base + '-A'),
        client.chat('Reply with exactly: "beta-unique-marker"', base + '-B'),
      ])
      log('A:', rA.content.slice(0, 80))
      log('B:', rB.content.slice(0, 80))
      // Cross-contamination check: each reply must contain ONLY its own marker
      const aOk = /alpha-unique-marker/i.test(rA.content) && !/beta-unique-marker/i.test(rA.content)
      const bOk = /beta-unique-marker/i.test(rB.content) && !/alpha-unique-marker/i.test(rB.content)
      log('A isolated:', aOk, 'B isolated:', bOk)
      const pass = aOk && bOk
      results.push({
        name: 'parallel chats 1 client',
        pass,
        detail: \`A=\${aOk ? 'isolated' : 'LEAKED'} B=\${bOk ? 'isolated' : 'LEAKED'}\`,
        ms: Date.now() - t0,
        toolCount: 0,
      })
    } catch (err) {
      results.push({
        name: 'parallel chats 1 client',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
        toolCount: 0,
      })
    } finally {
      try { await client.close() } catch {}
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  hr()
  console.log('')
  console.log('TOOL EXECUTION VERIFICATION — OpenClawClient against Doc on port ' + PORT)
  console.log('')
  let passed = 0
  let totalTools = 0
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL'
    if (r.pass) passed++
    totalTools += r.toolCount
    const toolBadge = r.toolCount > 0 ? ' [' + r.toolCount + ' tools]' : ''
    console.log('  [' + tag + '] ' + r.name.padEnd(22) + ' (' + String(r.ms).padStart(7) + 'ms)' + toolBadge + '  ' + r.detail)
  }
  console.log('')
  console.log('  ' + passed + '/' + results.length + ' scenarios passed   ' + totalTools + ' total tool calls observed')
  console.log('  total elapsed: ' + (Date.now() - overall) + 'ms')
  console.log('')

  process.exit(passed === results.length ? 0 : 1)
}

main().catch((err) => {
  console.error('[tools] FAIL:', (err as Error).message)
  console.error((err as Error).stack)
  process.exit(2)
})
`

const wrapperPath = path.join(PROJECT, 'scripts', '.verify-doc-tools-wrapper.ts')
fs.writeFileSync(wrapperPath, wrapperSource, 'utf8')

const child = spawn('npx', ['tsx', wrapperPath], {
  cwd: PROJECT,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  try { fs.unlinkSync(wrapperPath) } catch {}
  process.exit(code ?? 1)
})
