/**
 * GET /api/jarvis/profile
 *
 * Returns the current bo.md content so the mobile app (or any client) can
 * display the living Bo profile — including the Cognitive Patterns section
 * written by the reflector.
 *
 * Read-only. No auth required for local dev; add middleware auth before
 * exposing to production.
 */

import { readBoProfile } from '@/lib/jarvis/vault'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const profile = await readBoProfile()
    return Response.json({ ok: true, profile })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error('[jarvis/profile] readBoProfile failed:', msg)
    return Response.json(
      { ok: false, error: 'failed to read profile', code: 'READ_FAILED' },
      { status: 500 },
    )
  }
}
