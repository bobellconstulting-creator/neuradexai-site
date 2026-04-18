#!/usr/bin/env node
/**
 * scripts/verify-tool-alerts.mjs
 *
 * Phase 5 verification: dispatchTool failure detection + Telegram alerting + dedupe.
 *
 * Runs with JARVIS_TELEGRAM_ALERTS=0 so no real Telegram messages send —
 * alerts log to stderr via the suppressed-env path, and this script asserts
 * that the log lines appeared at the expected times.
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-tool-alerts.mjs
 *
 * Exit code: 0 = all assertions pass, non-zero = failure.
 */

process.env.JARVIS_TELEGRAM_ALERTS = '0'
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-token'
process.env.JARVIS_OWNER_CHAT_ID = process.env.JARVIS_OWNER_CHAT_ID || '7240677590'

const { dispatchTool } = await import('../lib/jarvis/tools.ts')

// ── Console capture ────────────────────────────────────────────────────────
const captured = { warn: [], error: [] }
const origWarn = console.warn
const origError = console.error
console.warn = (...args) => { captured.warn.push(args.join(' ')); origWarn(...args) }
console.error = (...args) => { captured.error.push(args.join(' ')); origError(...args) }

function resetCapture() { captured.warn = []; captured.error = [] }

function assert(cond, label) {
  if (!cond) {
    origError(`  FAIL: ${label}`)
    process.exitCode = 1
    return false
  }
  origWarn(`  PASS: ${label}`)
  return true
}

// ── Test 1: Valid tool → success, no alert ─────────────────────────────────
origWarn('\n[Test 1] Valid tool (systemInfo) → success, no alert')
resetCapture()
const r1 = await dispatchTool('systemInfo', {})
assert(r1.ok === true, 'systemInfo returns ok=true')
assert(
  !captured.warn.some((l) => l.includes('[jarvis-alert:suppressed-env]')),
  'no alert fired for success'
)

// ── Test 2: Unknown tool name → failure, NO alert (policy) ─────────────────
origWarn('\n[Test 2] Unknown tool → ok=false, no alert (policy)')
resetCapture()
const r2 = await dispatchTool('nonExistentTool_xyz', {})
assert(r2.ok === false, 'unknown tool returns ok=false')
assert(r2.error && r2.error.includes('unknown tool'), 'error mentions unknown tool')
assert(
  !captured.warn.some((l) => l.includes('[jarvis-alert:suppressed-env]')),
  'no alert fired for unknown tool (operator/caller error policy)'
)

// ── Test 3: Tool returns ok=false → alert fires ─────────────────────────────
origWarn('\n[Test 3] Failing tool (readDoc with missing path) → alert')
resetCapture()
const r3 = await dispatchTool('readDoc', { path: '__nonexistent_' + Date.now() + '.md' })
assert(r3.ok === false, 'readDoc on missing file returns ok=false')
assert(
  captured.warn.some((l) => l.includes('[jarvis-alert:suppressed-env]') && l.includes('tool=readDoc')),
  'alert fired for readDoc failure (observed via JARVIS_TELEGRAM_ALERTS=0 log)'
)

// ── Test 4: Same failure twice in 60s → second is deduped ──────────────────
origWarn('\n[Test 4] Same failure repeated within 60s → deduped')
resetCapture()
const samePath = '__nonexistent_dedupe_' + Date.now() + '.md'
await dispatchTool('readDoc', { path: samePath })
const firstCount = captured.warn.filter((l) => l.includes('[jarvis-alert:suppressed-env]')).length
await dispatchTool('readDoc', { path: samePath })
const secondCount = captured.warn.filter((l) => l.includes('[jarvis-alert:suppressed-env]')).length
assert(firstCount === 1, 'first call produced exactly one alert')
assert(secondCount === 1, 'second call did NOT produce a new alert (deduped)')

// ── Summary ────────────────────────────────────────────────────────────────
origWarn('\n[verify-tool-alerts] ' + (process.exitCode ? 'FAILED' : 'ALL PASSED'))
process.exit(process.exitCode || 0)
