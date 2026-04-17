/**
 * Merit — Etsy OAuth PKCE token management.
 *
 * Tokens are stored at C:/Users/bobel/.secrets/etsy-tokens.json as:
 *   { access_token, refresh_token, expires_at }
 *
 * PKCE flow:
 *   1. buildEtsyAuthUrl()  → redirect user to Etsy
 *   2. Etsy redirects back with ?code=
 *   3. Exchange code + verifier for tokens (handled by etsy-callback route)
 *   4. saveEtsyTokens() persists them
 *   5. getValidEtsyToken() returns a live token, refreshing as needed
 *
 * Env vars:
 *   ETSY_API_KEY       — Etsy App key (client ID)
 *   ETSY_SHARED_SECRET — Etsy App shared secret (client secret)
 *   NEXTAUTH_URL       — Base URL for redirect URI construction
 */
import { promises as fs } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
import path from 'node:path'

// ─── Config ───────────────────────────────────────────────────────────────────

const ETSY_API_KEY       = process.env.ETSY_API_KEY ?? ''
const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET ?? ''
const NEXTAUTH_URL       = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

const TOKENS_PATH = 'C:/Users/bobel/.secrets/etsy-tokens.json'
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'
const ETSY_AUTH_BASE = 'https://www.etsy.com/oauth/connect'

// Scopes needed for listing management
const ETSY_SCOPES = ['listings_r', 'listings_w', 'listings_d'].join(' ')

// ─── Token file types ─────────────────────────────────────────────────────────

interface StoredTokens {
  access_token: string
  refresh_token: string
  expires_at: string   // ISO datetime string
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  // 32 random bytes → base64url → 43-128 char verifier per RFC 7636
  return randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateState(): string {
  return randomBytes(16).toString('hex')
}

// ─── Token persistence ────────────────────────────────────────────────────────

async function readTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await fs.readFile(TOKENS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).access_token !== 'string' ||
      typeof (parsed as Record<string, unknown>).refresh_token !== 'string' ||
      typeof (parsed as Record<string, unknown>).expires_at !== 'string'
    ) {
      return null
    }
    return parsed as StoredTokens
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`readTokens: failed to read token file: ${(err as Error).message}`)
  }
}

export async function saveEtsyTokens(
  access: string,
  refresh: string,
  expiresIn: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const tokens: StoredTokens = {
    access_token: access,
    refresh_token: refresh,
    expires_at: expiresAt,
  }

  try {
    await fs.mkdir(path.dirname(TOKENS_PATH), { recursive: true })
    await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8')
  } catch (err: unknown) {
    throw new Error(`saveEtsyTokens: failed to write token file: ${(err as Error).message}`)
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

interface TokenRefreshResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  if (!ETSY_API_KEY || !ETSY_SHARED_SECRET) {
    throw new Error('refreshAccessToken: ETSY_API_KEY or ETSY_SHARED_SECRET not set')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ETSY_API_KEY,
    refresh_token: refreshToken,
  })

  let response: Response
  try {
    response = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`).toString('base64'),
      },
      body: body.toString(),
    })
  } catch (err: unknown) {
    throw new Error(`refreshAccessToken: network error: ${(err as Error).message}`)
  }

  const data = (await response.json()) as TokenRefreshResponse

  if (!response.ok || !data.access_token) {
    throw new Error(
      `refreshAccessToken: Etsy error: ${data.error_description ?? data.error ?? response.status}`,
    )
  }

  const refreshed: StoredTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  }

  await saveEtsyTokens(refreshed.access_token, refreshed.refresh_token, data.expires_in ?? 3600)
  return refreshed
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a valid Etsy access token.
 * - If no tokens are stored, returns null.
 * - If the token has expired (with a 60s buffer), attempts a refresh.
 * - Returns null if refresh fails.
 */
export async function getValidEtsyToken(): Promise<string | null> {
  const tokens = await readTokens()
  if (!tokens) return null

  const expiresAt = new Date(tokens.expires_at).getTime()
  const nowWithBuffer = Date.now() + 60_000  // 60s buffer before expiry

  if (nowWithBuffer < expiresAt) {
    // Token is still valid
    return tokens.access_token
  }

  // Token is expired — attempt refresh
  try {
    const refreshed = await refreshAccessToken(tokens.refresh_token)
    return refreshed.access_token
  } catch (err: unknown) {
    console.error(`[WARN] getValidEtsyToken: refresh failed: ${(err as Error).message}`)
    return null
  }
}

/**
 * Builds the Etsy OAuth authorization URL using PKCE.
 * Store the returned codeVerifier in session storage before redirecting.
 */
export function buildEtsyAuthUrl(redirectUri: string): {
  url: string
  codeVerifier: string
  state: string
} {
  if (!ETSY_API_KEY) {
    throw new Error('buildEtsyAuthUrl: ETSY_API_KEY is not set')
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: ETSY_SCOPES,
    client_id: ETSY_API_KEY,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return {
    url: `${ETSY_AUTH_BASE}?${params.toString()}`,
    codeVerifier,
    state,
  }
}

/**
 * Exchanges an authorization code for tokens. Used in the callback route.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<void> {
  if (!ETSY_API_KEY) {
    throw new Error('exchangeCodeForTokens: ETSY_API_KEY is not set')
  }

  const redirectUri = `${NEXTAUTH_URL}/api/mercy/etsy-callback`

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ETSY_API_KEY,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  })

  let response: Response
  try {
    response = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (err: unknown) {
    throw new Error(`exchangeCodeForTokens: network error: ${(err as Error).message}`)
  }

  const data = (await response.json()) as TokenRefreshResponse

  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      `exchangeCodeForTokens: Etsy error: ${data.error_description ?? data.error ?? response.status}`,
    )
  }

  await saveEtsyTokens(data.access_token, data.refresh_token, data.expires_in ?? 3600)
}
