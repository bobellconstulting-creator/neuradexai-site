#!/usr/bin/env node
/**
 * COG vault reconciler — Phase 8d
 *
 * Walks the vault, finds notes missing from their MOC, detects orphans
 * (notes not linked from anywhere), and optionally rebuilds broken MOC entries.
 *
 * Usage:
 *   node scripts/cog-reconcile.mjs           # dry-run report
 *   node scripts/cog-reconcile.mjs --fix     # auto-append missing MOC entries
 */

import { readFile, writeFile, appendFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const VAULT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const FIX = process.argv.includes('--fix')

const MOC_MAP = {
  topic:    path.join(VAULT, '05-knowledge', '_MOC-knowledge.md'),
  project:  path.join(VAULT, '04-projects', '_MOC-projects.md'),
  person:   path.join(VAULT, '06-people', '_MOC-people.md'),
  daily:    path.join(VAULT, '01-daily', '_MOC-daily.md'),
  decision: path.join(VAULT, '04-projects', '_MOC-decisions.md'),
}

const SKIP_DIRS = new Set(['.brain', '.git', 'node_modules', '_archive', '00-meta'])
const SKIP_FILES = new Set(['_MOC-knowledge.md', '_MOC-projects.md', '_MOC-people.md', '_MOC-daily.md', '_MOC-decisions.md'])

async function walk(dir) {
  const entries = []
  let items
  try { items = await readdir(dir) } catch { return entries }
  for (const name of items) {
    const full = path.join(dir, name)
    const s = await stat(full).catch(() => null)
    if (!s) continue
    if (s.isDirectory()) {
      if (!SKIP_DIRS.has(name)) entries.push(...await walk(full))
    } else if (name.endsWith('.md') && !SKIP_FILES.has(name)) {
      entries.push(full)
    }
  }
  return entries
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 4)
  if (end === -1) return {}
  const raw = content.slice(4, end)
  const meta = {}
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return meta
}

async function readMoc(mocPath) {
  try { return await readFile(mocPath, 'utf8') } catch { return '' }
}

async function main() {
  console.log(`[reconcile] vault: ${VAULT}`)
  console.log(`[reconcile] mode: ${FIX ? 'FIX' : 'dry-run'}`)
  console.log()

  const files = await walk(VAULT)
  console.log(`[reconcile] found ${files.length} markdown notes\n`)

  // Load all MOC contents
  const mocContents = {}
  for (const [type, mocPath] of Object.entries(MOC_MAP)) {
    mocContents[type] = await readMoc(mocPath)
  }

  // Collect all wiki-links across the vault (for orphan detection)
  const allLinks = new Set()
  for (const f of files) {
    const content = await readFile(f, 'utf8').catch(() => '')
    const matches = content.matchAll(/\[\[([^\]|]+)[|\]]/g)
    for (const m of matches) allLinks.add(m[1].trim())
  }

  const missing = []
  const orphans = []
  const noType  = []

  for (const f of files) {
    const content = await readFile(f, 'utf8').catch(() => '')
    const meta = parseFrontmatter(content)
    const rel = path.relative(VAULT, f).replace(/\\/g, '/').replace(/\.md$/, '')

    if (!meta.type) { noType.push(rel); continue }
    const moc = MOC_MAP[meta.type]
    if (!moc) continue  // type not tracked

    const mocContent = mocContents[meta.type] ?? ''
    if (!mocContent.includes(rel)) {
      missing.push({ rel, type: meta.type, title: (meta.title ?? rel).replace(/^"(.*)"$/, '$1'), mocPath: moc })
    }

    // Orphan: not linked from anywhere and not a MOC or daily note
    if (!meta.type.startsWith('daily') && !allLinks.has(rel)) {
      orphans.push(rel)
    }
  }

  // Report
  console.log(`=== Missing from MOC (${missing.length}) ===`)
  for (const m of missing) console.log(`  [${m.type}] ${m.rel}`)

  console.log(`\n=== Orphans — not linked anywhere (${orphans.length}) ===`)
  for (const o of orphans) console.log(`  ${o}`)

  console.log(`\n=== Missing type frontmatter (${noType.length}) ===`)
  for (const n of noType) console.log(`  ${n}`)

  if (FIX && missing.length > 0) {
    console.log('\n[reconcile] applying fixes...')
    for (const m of missing) {
      const entry = `- [[${m.rel}|${m.title}]] — reconciled ${new Date().toISOString().slice(0, 10)}\n`
      await appendFile(m.mocPath, entry, 'utf8')
      console.log(`  + appended to ${path.basename(m.mocPath)}: ${m.rel}`)
    }
    console.log('[reconcile] done.')
  } else if (missing.length > 0) {
    console.log('\nRun with --fix to auto-append missing entries.')
  }

  console.log(`\n[reconcile] summary: ${missing.length} missing, ${orphans.length} orphans, ${noType.length} no-type`)
}

main().catch((e) => { console.error(e); process.exit(1) })
