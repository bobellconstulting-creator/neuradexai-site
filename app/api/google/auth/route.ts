/**
 * Google OAuth2 authorization entry point.
 *
 * Hit this in a browser to kick off the OAuth flow:
 *   http://localhost:3000/api/google/auth
 *
 * Redirects to Google's consent screen.
 */
import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(): NextResponse {
  let authUrl: string
  try {
    authUrl = getAuthUrl()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[google/auth] Cannot build auth URL:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  return NextResponse.redirect(authUrl)
}
