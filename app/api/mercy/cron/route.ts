/**
 * GET /api/mercy/cron?job=<job>
 *
 * Vercel cron endpoint for Merit income automation.
 * All jobs must complete in < 55 seconds (Vercel hobby limit).
 *
 * Jobs:
 *   poll-orders      — fetch new Printify orders, write ledger entries
 *   niche-research   — generate niche ideas for all 3 categories via Gemini
 *   donation-report  — send current ledger state to Bo via Telegram
 *
 * Response:
 *   200  { ok: true,  job: string, result: unknown }
 *   400  { ok: false, error: "unknown job" }
 *   500  { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { pollNewOrders }          from '@/lib/mercy/etsy-orders'
import { generateNicheIdeas }     from '@/lib/mercy/niche-research'
import { readLedger }             from '@/lib/mercy/ledger'
import {
  generateDonationReport,
  sendTelegramToBO,
} from '@/lib/mercy/donation-tracker'

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function jobPollOrders(): Promise<unknown> {
  return pollNewOrders()
}

async function jobNicheResearch(): Promise<unknown> {
  const categories = ['hunting', 'kids-family', 'inspirational-quotes']
  const results: Record<string, number> = {}

  for (const cat of categories) {
    try {
      const ideas = await generateNicheIdeas(cat)
      results[cat] = ideas.length
    } catch (err: unknown) {
      // Log per-category failure to COG but don't abort other categories
      console.error(`[mercy/cron] niche-research failed for "${cat}":`, (err as Error).message)
      results[cat] = 0
    }
  }

  return results
}

async function jobDonationReport(): Promise<unknown> {
  const state  = await readLedger()
  const report = generateDonationReport(state)
  await sendTelegramToBO(report)
  return {
    pendingDonation: state.pendingDonation,
    totalNetProfit:  state.totalNetProfit,
    totalDonated:    state.totalDonated,
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

const JOBS: Record<string, () => Promise<unknown>> = {
  'poll-orders':     jobPollOrders,
  'niche-research':  jobNicheResearch,
  'donation-report': jobDonationReport,
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const job = request.nextUrl.searchParams.get('job') ?? ''

  const handler = JOBS[job]
  if (!handler) {
    return NextResponse.json(
      { ok: false, error: `unknown job "${job}" — valid: ${Object.keys(JOBS).join(', ')}` },
      { status: 400 },
    )
  }

  try {
    const result = await handler()
    return NextResponse.json({ ok: true, job, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    // Log with context but don't leak internals to response
    console.error(`[mercy/cron] job="${job}" failed:`, message)
    return NextResponse.json(
      { ok: false, error: 'Cron job failed — check server logs' },
      { status: 500 },
    )
  }
}
