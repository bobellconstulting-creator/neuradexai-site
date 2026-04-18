import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { getSecret } from '@/lib/jarvis/secrets'

/**
 * Validates Bearer token on inbound /api/jarvis/tool POST requests.
 *
 * Returns NextResponse(401) on failure, null on success.
 * Fail-closed: if JARVIS_BRIDGE_SECRET is not in the secret store, rejects all calls.
 *
 * Secret source:
 *   - On Vercel runtime: process.env.JARVIS_BRIDGE_SECRET (Vercel's encrypted env)
 *   - On local Windows: DPAPI-encrypted blob via lib/jarvis/secrets.ts
 *
 * Uses SHA-256 hash + timingSafeEqual so comparison is constant-time
 * regardless of token length or content — no timing leaks.
 */
export async function checkBridgeAuth(req: NextRequest): Promise<NextResponse | null> {
  let secret: string | null = null
  try {
    secret = await getSecret('JARVIS_BRIDGE_SECRET')
  } catch (err) {
    console.error(`[bridge-auth] secret lookup threw: ${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json(
      { ok: false, error: 'bridge auth backend unavailable' },
      { status: 500 }
    )
  }

  if (!secret) {
    console.warn('[bridge-auth] JARVIS_BRIDGE_SECRET not configured — rejecting')
    return NextResponse.json(
      { ok: false, error: 'bridge not configured' },
      { status: 500 }
    )
  }

  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  const tokenHash = createHash('sha256').update(token).digest()
  const secretHash = createHash('sha256').update(secret).digest()

  if (!timingSafeEqual(tokenHash, secretHash)) {
    const ua = req.headers.get('user-agent') ?? '-'
    console.warn(`[bridge-auth] 401 ${new Date().toISOString()} ua=${ua}`)
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    )
  }

  return null
}
