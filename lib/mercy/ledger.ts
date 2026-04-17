/**
 * Merit ledger — read/write INCOME-LEDGER.md in COG vault.
 *
 * File format:
 *   # Merit Income Ledger
 *   <human-readable summary table>
 *   <!-- mercy-ledger-json-start -->
 *   { LedgerState JSON }
 *   <!-- mercy-ledger-json-end -->
 *
 * Writes are atomic: temp file → rename, so a crash can't corrupt the ledger.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  type LedgerEntry,
  type DonationRecord,
  type LedgerState,
  ledgerStateSchema,
  emptyLedgerState,
} from './types'

// ─── Config ───────────────────────────────────────────────────────────────────

const COG_BASE = process.env.COG_PATH ?? 'C:/Users/bobel/COG'
const LEDGER_PATH = path.join(COG_BASE, '04-projects', 'mercy-engine', 'INCOME-LEDGER.md')

const JSON_START = '<!-- mercy-ledger-json-start -->'
const JSON_END   = '<!-- mercy-ledger-json-end -->'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function buildMarkdown(state: LedgerState): string {
  const summary = [
    `# Merit Income Ledger`,
    `Last updated: ${state.lastUpdated}`,
    ``,
    `## Summary`,
    `| Metric | Amount |`,
    `|--------|--------|`,
    `| Gross Revenue | ${centsToDisplay(state.totalGrossRevenue)} |`,
    `| Platform Fees | ${centsToDisplay(state.totalFees)} |`,
    `| Production Costs | ${centsToDisplay(state.totalProductionCost)} |`,
    `| Net Profit | ${centsToDisplay(state.totalNetProfit)} |`,
    `| Total Donated | ${centsToDisplay(state.totalDonated)} |`,
    `| Pending Donation | ${centsToDisplay(state.pendingDonation)} |`,
    ``,
  ].join('\n')

  const jsonBlock = [
    JSON_START,
    JSON.stringify(state, null, 2),
    JSON_END,
    '',
  ].join('\n')

  return summary + jsonBlock
}

function extractJson(content: string): string | null {
  const start = content.indexOf(JSON_START)
  const end   = content.indexOf(JSON_END)
  if (start === -1 || end === -1 || end <= start) return null
  return content.slice(start + JSON_START.length, end).trim()
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function readLedger(): Promise<LedgerState> {
  let raw: string
  try {
    raw = await fs.readFile(LEDGER_PATH, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyLedgerState()
    }
    throw new Error(`readLedger: failed to read file: ${(err as Error).message}`)
  }

  const jsonStr = extractJson(raw)
  if (jsonStr === null) {
    throw new Error('readLedger: JSON markers not found in ledger file')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (err: unknown) {
    throw new Error(`readLedger: invalid JSON in ledger file: ${(err as Error).message}`)
  }

  const result = ledgerStateSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`readLedger: schema validation failed: ${result.error.message}`)
  }

  return result.data
}

export async function writeLedger(state: LedgerState): Promise<void> {
  const content = buildMarkdown(state)
  const tmpPath = LEDGER_PATH + '.tmp'

  try {
    await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true })
    await fs.writeFile(tmpPath, content, 'utf8')
    await fs.rename(tmpPath, LEDGER_PATH)
  } catch (err: unknown) {
    // Clean up temp file if rename failed
    try { await fs.unlink(tmpPath) } catch { /* ignore */ }
    throw new Error(`writeLedger: write failed: ${(err as Error).message}`)
  }
}

export function recalculateTotals(state: LedgerState): LedgerState {
  const activeEntries = state.entries.filter(e => e.status !== 'refunded')

  const totalGrossRevenue  = activeEntries.reduce((sum, e) => sum + e.grossRevenue, 0)
  const totalFees          = activeEntries.reduce((sum, e) => sum + e.platformFee, 0)
  const totalProductionCost = activeEntries.reduce((sum, e) => sum + e.productionCost, 0)
  const totalNetProfit     = activeEntries.reduce((sum, e) => sum + e.netProfit, 0)
  const totalDonated       = state.donations.reduce((sum, d) => sum + d.amount, 0)
  const pendingDonation    = totalNetProfit - totalDonated

  return {
    ...state,
    totalGrossRevenue,
    totalFees,
    totalProductionCost,
    totalNetProfit,
    totalDonated,
    pendingDonation,
    lastUpdated: new Date().toISOString(),
  }
}

export async function appendEntry(entry: LedgerEntry): Promise<LedgerState> {
  const state = await readLedger()
  const updated = recalculateTotals({
    ...state,
    entries: [...state.entries, entry],
  })
  await writeLedger(updated)
  return updated
}

export async function markDonation(record: DonationRecord): Promise<LedgerState> {
  const state = await readLedger()
  const updated = recalculateTotals({
    ...state,
    donations: [...state.donations, record],
  })
  await writeLedger(updated)
  return updated
}
