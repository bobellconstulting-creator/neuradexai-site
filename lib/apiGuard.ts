/**
 * API route guard for Mission Control endpoints.
 *
 * Localized (per-route) security instead of global Next.js middleware, so we
 * can protect /api/mission/* without touching NextAuth or other routes.
 *
 * Checks:
 *   1. Body size limit  — reject requests > MAX_BODY_BYTES
 *   2. Rate limit       — in-memory sliding window per IP, MAX_REQ_PER_MIN
 *   3. Host/origin      — loopback only unless MC_ALLOW_REMOTE=1 in env
 *
 * Design notes:
 *   - In-memory rate limit is per-process. Dev server is single-process so
 *     this is fine. If Bo ever deploys to Vercel edge with multiple instances,
 *     swap for Upstash Redis or similar.
 *   - No auth token by default because the HUD is currently localhost-only.
 *     When deploying publicly, set MC_API_TOKEN env var and callers must
 *     pass `x-mc-token: <token>` header.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const MAX_BODY_BYTES = 16 * 1024 // 16 KB
const MAX_REQ_PER_MIN = Number(process.env.MC_RATE_LIMIT_PER_MIN ?? 60)
const WINDOW_MS = 60_000

interface RateWindow {
  count: number
  windowStart: number
}

const rateMap = new Map<string, RateWindow>()

function clientKey(req: NextRequest): string {
  // NextRequest has no direct IP; use x-forwarded-for or fall back to 'local'.
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'local'
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const existing = rateMap.get(key)
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    rateMap.set(key, { count: 1, windowStart: now })
    return true
  }
  existing.count++
  if (existing.count > MAX_REQ_PER_MIN) return false
  return true
}

function isLoopback(req: NextRequest): boolean {
  // Dev server on localhost — trust only 127.0.0.1 / ::1 / localhost
  const host = req.headers.get('host') ?? ''
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    return true
  }
  return false
}

export interface GuardOptions {
  /** Skip body size check (e.g. for GET routes) */
  skipBody?: boolean
  /** Skip rate limit check (e.g. for stream endpoints that poll) */
  skipRate?: boolean
}

/**
 * Guard a Mission Control API route. Returns NextResponse on rejection,
 * or null if the request passes all checks.
 *
 * Usage:
 * ```ts
 * const blocked = await guardApiRoute(req)
 * if (blocked) return blocked
 * ```
 */
export async function guardApiRoute(
  req: NextRequest,
  opts: GuardOptions = {},
): Promise<NextResponse | null> {
  // Check 1: host — loopback only unless explicitly allowed
  const allowRemote = process.env.MC_ALLOW_REMOTE === '1'
  if (!allowRemote && !isLoopback(req)) {
    return NextResponse.json(
      { ok: false, error: 'Mission Control is loopback-only. Set MC_ALLOW_REMOTE=1 to override.' },
      { status: 403 },
    )
  }

  // Check 2: optional token (only enforced if MC_API_TOKEN is set)
  const expectedToken = process.env.MC_API_TOKEN
  if (expectedToken) {
    const provided = req.headers.get('x-mc-token')
    if (provided !== expectedToken) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid x-mc-token header' },
        { status: 401 },
      )
    }
  }

  // Check 3: rate limit per client
  if (!opts.skipRate) {
    const key = clientKey(req)
    if (!checkRateLimit(key)) {
      return NextResponse.json(
        { ok: false, error: `Rate limit exceeded (${MAX_REQ_PER_MIN}/min)` },
        { status: 429 },
      )
    }
  }

  // Check 4: body size (only for POST/PUT/PATCH)
  if (!opts.skipBody && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentLength = req.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` },
        { status: 413 },
      )
    }
  }

  return null
}
