/**
 * GET /api/mercy/ledger
 *
 * Returns current LedgerState as JSON. Read-only, no auth required
 * (localhost-focused dashboard consumption).
 *
 * Response:
 *   200  { ok: true,  data: LedgerState }
 *   500  { ok: false, error: string }
 */
import { NextResponse } from 'next/server'
import { readLedger } from '@/lib/mercy/ledger'

export async function GET(): Promise<NextResponse> {
  try {
    const state = await readLedger()
    return NextResponse.json({ ok: true, data: state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error reading ledger'
    // Log server-side with enough context, don't leak internals to client
    console.error('[mercy/ledger] GET failed:', message)
    return NextResponse.json(
      { ok: false, error: 'Failed to read ledger' },
      { status: 500 },
    )
  }
}
