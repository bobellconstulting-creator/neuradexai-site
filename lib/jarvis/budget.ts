/**
 * Jarvis budget tracker — tracks token usage and cost per provider per day.
 * Writes daily budget snapshots to workspace-jarvis/budget-<date>.json.
 * Alerts Bo via Telegram when soft/hard caps are hit.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const WORKSPACE = process.env.JARVIS_WORKSPACE ?? 'C:/Users/bobel/.openclaw/workspace-jarvis'
const BUDGET_DIR = path.join(WORKSPACE, 'budgets')

// Soft cap: $1/day paid. Hard cap: $5/week paid.
const SOFT_CAP_DAILY_USD  = 1.0
const HARD_CAP_WEEKLY_USD = 5.0

// Approximate cost per 1k tokens (input + output blended)
const COST_PER_1K: Record<string, number> = {
  'claude-haiku-4-5-20251001': 0.00125,  // $1.25/1M input, $5/1M output — blended ~$1.25/1M
  'groq/llama-3.3-70b-versatile': 0,
  'gemini-2.5-flash': 0,
  'openrouter/meta-llama': 0,
  'nvidia/deepseek-v3.2': 0,
}

export interface UsageEntry {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  ts: string
}

interface DailyBudget {
  date: string
  entries: UsageEntry[]
  totalCostUsd: number
  paidCostUsd: number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function budgetPath(date: string): string {
  return path.join(BUDGET_DIR, `budget-${date}.json`)
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(COST_PER_1K).find((k) => model.includes(k)) ?? ''
  const rate = COST_PER_1K[key] ?? 0
  return ((inputTokens + outputTokens) / 1000) * rate
}

export async function recordUsage(entry: Omit<UsageEntry, 'ts'>): Promise<void> {
  const date = today()
  const file = budgetPath(date)

  let budget: DailyBudget
  try {
    await mkdir(BUDGET_DIR, { recursive: true })
    const raw = await readFile(file, 'utf8')
    budget = JSON.parse(raw) as DailyBudget
  } catch {
    budget = { date, entries: [], totalCostUsd: 0, paidCostUsd: 0 }
  }

  const full: UsageEntry = { ...entry, ts: new Date().toISOString() }
  budget.entries.push(full)
  budget.totalCostUsd += full.costUsd
  if (full.costUsd > 0) budget.paidCostUsd += full.costUsd

  await writeFile(file, JSON.stringify(budget, null, 2), 'utf8').catch(() => {/* non-fatal on Vercel */})

  // Check caps
  if (budget.paidCostUsd >= SOFT_CAP_DAILY_USD) {
    await alertBudget(`WATCHING: paid spend today $${budget.paidCostUsd.toFixed(3)} — approaching daily cap.`)
  }
}

export async function weeklyPaidSpend(): Promise<number> {
  let total = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    try {
      const raw = await readFile(budgetPath(d), 'utf8')
      const b = JSON.parse(raw) as DailyBudget
      total += b.paidCostUsd
    } catch { /* no data for this day */ }
  }
  return total
}

async function alertBudget(msg: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.JARVIS_OWNER_CHAT_ID ?? '7240677590'
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg }),
  }).catch(() => {})
}
