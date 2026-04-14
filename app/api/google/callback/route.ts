/**
 * Google OAuth2 callback handler.
 *
 * Called by Google after the user grants access. Exchanges the `code` param
 * for tokens and persists the refresh_token to .secrets/google-oauth.json
 * and .secrets/google-oauth.env.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OAUTH_JSON_PATH = 'C:/Users/bobel/.secrets/google-oauth.json'
const OAUTH_ENV_PATH = 'C:/Users/bobel/.secrets/google-oauth.env'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface StoredTokens {
  refresh_token: string
  access_token?: string
  expiry?: number
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function readExistingTokens(): StoredTokens | null {
  try {
    if (!existsSync(OAUTH_JSON_PATH)) return null
    const raw = readFileSync(OAUTH_JSON_PATH, 'utf8')
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

function writeTokenJson(tokens: StoredTokens): void {
  writeFileSync(OAUTH_JSON_PATH, JSON.stringify(tokens, null, 2), 'utf8')
}

function updateEnvFile(refreshToken: string): void {
  try {
    let content = existsSync(OAUTH_ENV_PATH)
      ? readFileSync(OAUTH_ENV_PATH, 'utf8')
      : ''

    const key = 'GOOGLE_OAUTH_REFRESH_TOKEN'
    const line = `${key}=${refreshToken}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')

    if (pattern.test(content)) {
      content = content.replace(pattern, line)
    } else {
      content = content.trimEnd() + '\n' + line + '\n'
    }

    writeFileSync(OAUTH_ENV_PATH, content, 'utf8')
  } catch (err) {
    // Non-fatal — token is already saved to JSON
    console.warn('[google/callback] Failed to update .env file:', err)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return new NextResponse(errorPage(error), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (!code) {
    return new NextResponse(errorPage('missing_code'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('[google/callback] Missing OAuth env vars')
    return new NextResponse(errorPage('server_misconfigured'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Exchange code for tokens
  let tokenData: TokenResponse
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    })

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    tokenData = await res.json() as TokenResponse

    if (!res.ok || tokenData.error) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[google/callback] Token exchange failed:', msg)
    return new NextResponse(errorPage('token_exchange_failed'), {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const { refresh_token, access_token, expires_in } = tokenData

  // Preserve existing refresh_token if Google didn't return a new one
  // (this can happen on re-auth without prompt=consent).
  const existing = readExistingTokens()
  const finalRefreshToken = refresh_token ?? existing?.refresh_token ?? ''

  if (!finalRefreshToken) {
    console.error('[google/callback] No refresh_token received — ensure prompt=consent is set')
    return new NextResponse(errorPage('no_refresh_token'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Only write if refresh_token changed (or file doesn't exist yet)
  if (!existing || existing.refresh_token !== finalRefreshToken) {
    const stored: StoredTokens = {
      refresh_token: finalRefreshToken,
      access_token: access_token,
      expiry: expires_in ? Date.now() + expires_in * 1_000 : undefined,
    }
    writeTokenJson(stored)
    updateEnvFile(finalRefreshToken)
  }

  return new NextResponse(successPage(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// HTML templates
// ──────────────────────────────────────────────────────────────────────────

function successPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Jarvis — Connected</title>
  <style>
    body { font-family: monospace; background: #0a0a0a; color: #00ff88;
           display: flex; align-items: center; justify-content: center;
           height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    p  { color: #888; font-size: 0.85rem; }
  </style>
  <script>setTimeout(() => window.close(), 3000);</script>
</head>
<body>
  <div class="box">
    <h1>Jarvis is connected to Google Calendar, sir.</h1>
    <p>This window will close automatically in 3 seconds.</p>
  </div>
</body>
</html>`
}

function errorPage(reason: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Jarvis — Auth Error</title>
  <style>
    body { font-family: monospace; background: #0a0a0a; color: #ff4444;
           display: flex; align-items: center; justify-content: center;
           height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    p  { color: #888; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Auth failed: ${reason}</h1>
    <p>Check the server logs and try again.</p>
  </div>
</body>
</html>`
}
