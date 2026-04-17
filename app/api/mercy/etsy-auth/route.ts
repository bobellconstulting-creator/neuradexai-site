/**
 * GET /api/mercy/etsy-auth
 *
 * Initiates the Etsy OAuth PKCE flow:
 *   1. Generates a PKCE code_verifier + code_challenge
 *   2. Stores the code_verifier in a temp file (no session/DB dependency)
 *   3. Redirects the browser to Etsy's OAuth authorization URL
 *
 * Required env vars:
 *   ETSY_API_KEY       — Etsy App key (client ID)
 *   ETSY_SHARED_SECRET — Etsy App shared secret
 *   NEXTAUTH_URL       — Base URL used to construct the redirect URI
 *
 * After Etsy auth completes, Etsy redirects to:
 *   {NEXTAUTH_URL}/api/mercy/etsy-callback?code=...&state=...
 */
import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { buildEtsyAuthUrl } from '@/lib/mercy/etsy-auth'

// Temp file to persist code_verifier + state between the redirect and callback.
// Using a file because Next.js API routes are stateless (no server-side session).
const VERIFIER_STORE_PATH = 'C:/Users/bobel/.secrets/etsy-pkce-state.json'

export async function GET(): Promise<NextResponse> {
  const apiKey       = process.env.ETSY_API_KEY ?? ''
  const sharedSecret = process.env.ETSY_SHARED_SECRET ?? ''
  const baseUrl      = process.env.NEXTAUTH_URL ?? ''

  if (!apiKey || !sharedSecret) {
    return NextResponse.json(
      { error: 'ETSY_API_KEY and ETSY_SHARED_SECRET must be set', code: 'MISSING_ENV' },
      { status: 500 },
    )
  }

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'NEXTAUTH_URL must be set', code: 'MISSING_ENV' },
      { status: 500 },
    )
  }

  const redirectUri = `${baseUrl}/api/mercy/etsy-callback`

  let authData: { url: string; codeVerifier: string; state: string }
  try {
    authData = buildEtsyAuthUrl(redirectUri)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message, code: 'AUTH_BUILD_FAILED' },
      { status: 500 },
    )
  }

  // Persist verifier + state so the callback can retrieve them
  try {
    await fs.mkdir(path.dirname(VERIFIER_STORE_PATH), { recursive: true })
    await fs.writeFile(
      VERIFIER_STORE_PATH,
      JSON.stringify({ codeVerifier: authData.codeVerifier, state: authData.state }),
      'utf8',
    )
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to store PKCE state: ${(err as Error).message}`, code: 'STATE_STORE_FAILED' },
      { status: 500 },
    )
  }

  // Redirect to Etsy
  return NextResponse.redirect(authData.url)
}
