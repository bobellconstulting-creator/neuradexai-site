/**
 * GET /api/mercy/etsy-callback?code=...&state=...
 *
 * Handles the Etsy OAuth PKCE callback:
 *   1. Reads the stored code_verifier + expected state
 *   2. Validates the returned state to prevent CSRF
 *   3. Exchanges the authorization code for access + refresh tokens
 *   4. Saves tokens to ~/.secrets/etsy-tokens.json
 *   5. Returns { ok: true, message } or { ok: false, error }
 *
 * This route is safe to call from a browser; it does NOT expose tokens in the
 * response — they are written only to disk.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import { exchangeCodeForTokens } from '@/lib/mercy/etsy-auth'

const VERIFIER_STORE_PATH = 'C:/Users/bobel/.secrets/etsy-pkce-state.json'

interface StoredPkceState {
  codeVerifier: string
  state: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl

  const code          = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const etsyError     = searchParams.get('error')

  // Etsy may return an error (e.g. user denied access)
  if (etsyError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Etsy OAuth denied: ${etsyError}`,
        code: 'ETSY_OAUTH_ERROR',
      },
      { status: 400 },
    )
  }

  if (!code) {
    return NextResponse.json(
      { ok: false, error: 'Missing authorization code', code: 'MISSING_CODE' },
      { status: 400 },
    )
  }

  // Read stored PKCE state
  let stored: StoredPkceState
  try {
    const raw = await fs.readFile(VERIFIER_STORE_PATH, 'utf8')
    stored = JSON.parse(raw) as StoredPkceState
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: 'PKCE state not found — restart the auth flow via /api/mercy/etsy-auth',
        code: 'STATE_NOT_FOUND',
      },
      { status: 400 },
    )
  }

  // CSRF: validate state
  if (!returnedState || returnedState !== stored.state) {
    return NextResponse.json(
      { ok: false, error: 'State mismatch — possible CSRF attempt', code: 'STATE_MISMATCH' },
      { status: 400 },
    )
  }

  // Exchange code for tokens
  try {
    await exchangeCodeForTokens(code, stored.codeVerifier)
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: `Token exchange failed: ${(err as Error).message}`,
        code: 'TOKEN_EXCHANGE_FAILED',
      },
      { status: 500 },
    )
  }

  // Clean up the PKCE state file — it's single-use
  try {
    await fs.unlink(VERIFIER_STORE_PATH)
  } catch {
    // Non-fatal — the file will just sit there until next auth
  }

  return NextResponse.json({ ok: true, message: 'Etsy connected' })
}
