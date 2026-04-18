#!/usr/bin/env node
/**
 * End-to-end verification for the /api/jarvis/tool Bearer auth.
 * Uses Node's fetch so the Bearer value is preserved byte-for-byte
 * (no bash trailing-newline stripping).
 */
import { spawnSync } from 'child_process'
import { readFileSync, unlinkSync, existsSync } from 'fs'

const URL = 'https://desktop-aqsknmq.tail304e2b.ts.net'
const PULL = '.env.verify-bridge'

process.on('exit', () => { if (existsSync(PULL)) try { unlinkSync(PULL) } catch {} })

// Get the secret with exact-byte fidelity
const pull = spawnSync('vercel', ['env', 'pull', PULL, '--environment=production', '--yes'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true,
})
if (pull.status !== 0) { console.error('pull failed:', pull.stderr); process.exit(1) }
const env = readFileSync(PULL, 'utf8')
const line = env.split(/\r?\n/).find(l => l.startsWith('JARVIS_BRIDGE_SECRET='))
let secret = line.slice('JARVIS_BRIDGE_SECRET='.length)
if (secret.startsWith('"') && secret.endsWith('"')) {
  secret = secret.slice(1, -1)
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
    .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

console.log(`secret: ${secret.length} chars, lastByte=0x${secret.charCodeAt(secret.length-1).toString(16)}`)

async function test(label, init, expectedStatus) {
  const res = await fetch(`${URL}/api/jarvis/tool`, init)
  const body = await res.text()
  const pass = res.status === expectedStatus
  console.log(`${pass ? '✓' : '✗'} ${label} — HTTP ${res.status} (expected ${expectedStatus})`)
  if (!pass || label.includes('with Bearer')) {
    console.log(`  body: ${body.slice(0, 200)}`)
  }
  return pass
}

console.log('=== Phase 4 bridge auth verification ===\n')

const results = []
results.push(await test('(a) GET manifest (no auth)', {}, 200))
results.push(await test('(b) POST no Bearer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'readDoc', args: { path: 'NEXUS-INDEX.md' } }),
}, 401))
results.push(await test('(c) POST with valid Bearer (exact bytes)', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
  body: JSON.stringify({ name: 'readDoc', args: { path: 'NEXUS-INDEX.md' } }),
}, 200))
results.push(await test('(d) POST with WRONG Bearer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-the-secret' },
  body: JSON.stringify({ name: 'readDoc', args: { path: 'NEXUS-INDEX.md' } }),
}, 401))

const allPass = results.every(r => r)
console.log(`\n${allPass ? 'ALL PASS — Phase 4 green' : 'SOME FAILED'}`)
process.exit(allPass ? 0 : 1)
