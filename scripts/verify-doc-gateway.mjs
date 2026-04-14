#!/usr/bin/env node
/**
 * Production-client verification against Doc gateway on 18789.
 * Runs 4 scenarios using the REAL OpenClawClient (via tsx):
 *   1. Connect + disconnect cleanly
 *   2. Baseline chat echo
 *   3. Connection reuse — 2 chats on same cached client
 *   4. Invalid method — confirm clean error without crashing connection
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(__dirname, '..')

const wrapperSource = `
import { OpenClawClient } from '../lib/openclawClient'

const PORT = 18789
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? 'ffa3c844a788ceb37d07ef220eb9d52e27c2f10ff673d7f3'

function log(...a: unknown[]) { console.log('[verify]', ...a) }
function hr() { console.log('-'.repeat(72)) }

async function main() {
  const results: Array<{ name: string; pass: boolean; detail: string; ms: number }> = []
  const overall = Date.now()

  // ── 1: connect + close ────────────────────────────────────────────────────
  hr(); log('SCENARIO 1: connect + close')
  {
    const t0 = Date.now()
    const client = new OpenClawClient({
      port: PORT,
      token: TOKEN,
      connectTimeoutMs: 30_000,
    })
    try {
      await client.connect()
      log('connected in', Date.now() - t0, 'ms, isConnected=', client.isConnected)
      await client.close()
      log('closed, isConnected=', client.isConnected)
      results.push({
        name: 'connect + close',
        pass: true,
        detail: 'clean handshake and close',
        ms: Date.now() - t0,
      })
    } catch (err) {
      results.push({
        name: 'connect + close',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
      })
    }
  }

  // ── 2: baseline chat ──────────────────────────────────────────────────────
  hr(); log('SCENARIO 2: baseline chat echo')
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
      log('connected in', Date.now() - t0, 'ms')
      const chatStart = Date.now()
      const result = await client.chat(
        'Reply with exactly: "verify ok"',
        'verify-baseline-' + Date.now(),
      )
      const chatMs = Date.now() - chatStart
      log('chat completed in', chatMs, 'ms')
      log('response:', result.content.slice(0, 200))
      log('tool calls:', result.toolCalls.length)
      const pass = /verify ok/i.test(result.content)
      results.push({
        name: 'baseline chat',
        pass,
        detail: \`content="\${result.content.slice(0, 60)}" tools=\${result.toolCalls.length}\`,
        ms: Date.now() - t0,
      })
    } catch (err) {
      results.push({
        name: 'baseline chat',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
      })
    } finally {
      try { await client.close() } catch {}
    }
  }

  // ── 3: connection reuse — 2 sequential chats on same client ──────────────
  hr(); log('SCENARIO 3: connection reuse (2 sequential chats)')
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
      const base = 'verify-reuse-' + Date.now()
      const cStart1 = Date.now()
      const r1 = await client.chat('Reply with exactly: "first"', base + '-a')
      const elapsed1 = Date.now() - cStart1
      log('chat1:', r1.content.slice(0, 80), '(' + elapsed1 + 'ms)')
      const cStart2 = Date.now()
      const r2 = await client.chat('Reply with exactly: "second"', base + '-b')
      const elapsed2 = Date.now() - cStart2
      log('chat2:', r2.content.slice(0, 80), '(' + elapsed2 + 'ms)')
      log('still connected:', client.isConnected)
      const pass = /first/i.test(r1.content) && /second/i.test(r2.content) && client.isConnected
      results.push({
        name: 'connection reuse',
        pass,
        detail: \`r1="\${r1.content.slice(0,30)}" r2="\${r2.content.slice(0,30)}"\`,
        ms: Date.now() - t0,
      })
    } catch (err) {
      results.push({
        name: 'connection reuse',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
      })
    } finally {
      try { await client.close() } catch {}
    }
  }

  // ── 4: invalid method — connection should survive error ─────────────────
  hr(); log('SCENARIO 4: invalid method (error without crash)')
  {
    const t0 = Date.now()
    const client = new OpenClawClient({
      port: PORT,
      token: TOKEN,
      connectTimeoutMs: 30_000,
      requestTimeoutMs: 10_000,
    })
    try {
      await client.connect()
      let caught: Error | null = null
      try {
        await client.request('bogus.method.not.real', {}, 5_000)
      } catch (e) {
        caught = e as Error
      }
      log('got expected error:', caught?.message.slice(0, 120) ?? '(no error)')
      log('still connected after error:', client.isConnected)
      const pass = caught !== null && client.isConnected
      results.push({
        name: 'invalid method',
        pass,
        detail: \`error="\${caught?.message.slice(0,60)}" stillConnected=\${client.isConnected}\`,
        ms: Date.now() - t0,
      })
    } catch (err) {
      results.push({
        name: 'invalid method',
        pass: false,
        detail: String((err as Error).message),
        ms: Date.now() - t0,
      })
    } finally {
      try { await client.close() } catch {}
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  hr()
  console.log('')
  console.log('VERIFICATION REPORT — OpenClawClient against Doc on port ' + PORT)
  console.log('')
  let passed = 0
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL'
    if (r.pass) passed++
    console.log('  [' + tag + '] ' + r.name.padEnd(22) + ' (' + String(r.ms).padStart(7) + 'ms)  ' + r.detail)
  }
  console.log('')
  console.log('  ' + passed + '/' + results.length + ' passed   total elapsed: ' + (Date.now() - overall) + 'ms')
  console.log('')

  process.exit(passed === results.length ? 0 : 1)
}

main().catch((err) => {
  console.error('[verify] FAIL:', (err as Error).message)
  console.error((err as Error).stack)
  process.exit(2)
})
`

const wrapperPath = path.join(PROJECT, 'scripts', '.verify-doc-wrapper.ts')
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
