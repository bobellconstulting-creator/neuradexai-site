import { NextResponse } from 'next/server'
import { AGENTS } from '@/lib/agents'

/**
 * GET /api/agents
 *
 * Returns the full fleet registry plus bucketed id lists for convenience.
 * Used by the HUD and external status checks. Live status — never cached.
 */
export async function GET() {
  const active  = AGENTS.filter((a) => a.status !== 'dormant').map((a) => a.id)
  const dormant = AGENTS.filter((a) => a.status === 'dormant').map((a) => a.id)

  return NextResponse.json(
    { agents: AGENTS, active, dormant },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
