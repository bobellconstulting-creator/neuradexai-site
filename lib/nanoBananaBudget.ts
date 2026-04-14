/**
 * Nano Banana 2 daily budget tracker.
 *
 * Persists a simple counter to disk so we don't blow through free-tier
 * image-gen quota. Shared by the /api/image/generate and /api/image/budget
 * routes.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DAILY_CAP = 20

const BUDGET_FILE = path.join(
  'C:',
  'Users',
  'bobel',
  '.openclaw',
  'workspace-vault',
  'state',
  'nano-banana-budget.json',
)

export interface BudgetState {
  date: string
  count: number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readBudget(): Promise<BudgetState> {
  try {
    const raw = await readFile(BUDGET_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<BudgetState>
    if (typeof parsed.date === 'string' && typeof parsed.count === 'number') {
      return { date: parsed.date, count: parsed.count }
    }
  } catch {
    // missing or corrupt — fall through to fresh state
  }
  return { date: today(), count: 0 }
}

async function writeBudget(state: BudgetState): Promise<void> {
  await mkdir(path.dirname(BUDGET_FILE), { recursive: true })
  await writeFile(BUDGET_FILE, JSON.stringify(state, null, 2), 'utf8')
}

export async function getBudget(): Promise<BudgetState> {
  const state = await readBudget()
  if (state.date !== today()) {
    return { date: today(), count: 0 }
  }
  return state
}

export interface BudgetCheck {
  allowed: boolean
  state: BudgetState
  remaining: number
}

/**
 * Atomically check + increment. If allowed, the counter is bumped and
 * persisted before returning. If not, returns allowed=false.
 */
export async function consumeBudget(): Promise<BudgetCheck> {
  const current = await getBudget()
  if (current.count >= DAILY_CAP) {
    return { allowed: false, state: current, remaining: 0 }
  }
  const next: BudgetState = { date: current.date, count: current.count + 1 }
  await writeBudget(next)
  return { allowed: true, state: next, remaining: DAILY_CAP - next.count }
}
