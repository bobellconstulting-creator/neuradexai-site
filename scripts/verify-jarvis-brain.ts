// Verification harness: runs the vault + context-injector path with a MOCK
// reflection (no NVIDIA call) to confirm idempotency and prompt assembly.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Instinct } from '../lib/jarvis/types'

async function main() {
const TMP_VAULT = path.join(process.cwd(), '.tmp-jarvis-vault-verify')
await fs.rm(TMP_VAULT, { recursive: true, force: true })
process.env.JARVIS_VAULT_ROOT = TMP_VAULT

const vault = await import('../lib/jarvis/vault')
const injector = await import('../lib/jarvis/context-injector')

const mock = {
  facts: [
    { field: 'Location', value: 'Council Grove, Kansas (CT)', confidence: 0.95 },
    { field: 'Role', value: 'Founder of Neuradex AI', confidence: 0.98 },
  ],
  preferences: [
    { kind: 'liked' as const, about: 'Response style', detail: 'Terse, no fluff, lead with result', confidence: 0.9 },
    { kind: 'disliked' as const, about: 'Paid APIs as default', detail: 'Never default to Anthropic/OpenAI paid tier', confidence: 0.99 },
  ],
  decisions: [
    { decision: 'Free-first rule stays permanent', rationale: 'Cost incident on 2026-04-11', confidence: 0.9 },
  ],
  mistakes: [
    { mistake: 'Claimed production grade to justify paid API', avoidance: 'No hand-waving justification for spending', confidence: 0.85 },
  ],
  openQuestions: [
    { question: 'Should pending instincts expire after N days?', confidence: 0.4 },
  ],
}

const today = new Date().toISOString().slice(0, 10)

console.log('1. appendDaily (first + duplicate)')
await vault.appendDaily(today, 'Verification run — 2 facts extracted')
await vault.appendDaily(today, 'Verification run — 2 facts extracted')

console.log('2. updateBoProfile (first + duplicate)')
await vault.updateBoProfile(mock.facts)
await vault.updateBoProfile(mock.facts)

const instincts: Instinct[] = [
  ...mock.preferences.map((p) => ({ kind: 'preference' as const, title: `${p.kind}: ${p.about}`, body: p.detail, confidence: p.confidence, source: 'reflection' })),
  ...mock.decisions.map((d) => ({ kind: 'decision' as const, title: d.decision.slice(0, 60), body: `${d.decision}\n\nRationale: ${d.rationale}`, confidence: d.confidence, source: 'reflection' })),
  ...mock.mistakes.map((m) => ({ kind: 'mistake' as const, title: m.mistake.slice(0, 60), body: `${m.mistake}\n\nAvoid: ${m.avoidance}`, confidence: m.confidence, source: 'reflection' })),
  ...mock.openQuestions.map((q) => ({ kind: 'question' as const, title: q.question.slice(0, 60), body: q.question, confidence: q.confidence, source: 'reflection' })),
]

let promoted = 0
let pending = 0
for (const inst of instincts) {
  const r = await vault.promoteInstinct(inst)
  if (r.promoted) promoted++
  else pending++
}
console.log(`3. promoteInstinct first pass → promoted=${promoted} pending=${pending}`)

let noOps = 0
for (const inst of instincts) {
  const r = await vault.promoteInstinct(inst)
  if (!r.changed) noOps++
}
console.log(`4. promoteInstinct duplicate pass → idempotent=${noOps}/${instincts.length}`)

const top = await vault.listPromotedInstincts(10)
console.log(`5. listPromotedInstincts → ${top.length} items`)
for (const i of top.slice(0, 4)) {
  console.log(`   - [${i.kind}] ${i.title} (conf ${i.confidence})`)
}

injector.invalidateMemoryCache()
const prompt = await injector.buildJarvisSystemPrompt()
const tokens = Math.ceil(prompt.length / 4)
console.log(`6. buildJarvisSystemPrompt → ${prompt.length} chars (~${tokens} tokens)`)
console.log(`   contains "Promoted Instincts": ${prompt.includes('Promoted Instincts')}`)
console.log(`   contains "Current Bo Profile": ${prompt.includes('Current Bo Profile')}`)
console.log(`   contains "Recent Daily Notes":  ${prompt.includes('Recent Daily Notes')}`)

await fs.rm(TMP_VAULT, { recursive: true, force: true })
console.log('\nDONE')
}

main().catch((e) => { console.error(e); process.exit(1) })
