/**
 * GET /api/mission/persona/:id
 *
 * Returns the parsed persona for an agent, with a short in-memory LRU
 * cache (TTL 60s) to avoid re-parsing six .md files on every poll.
 */

import { NextRequest, NextResponse } from 'next/server'

import { guardApiRoute } from '@/lib/apiGuard'
import { parsePersona, type ParsedPersona } from '@/lib/personaParser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 60_000
const CACHE_MAX = 16

interface CacheEntry {
  persona: ParsedPersona
  expires: number
}

// Module-level LRU: Map preserves insertion order so we can evict oldest.
const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): ParsedPersona | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    cache.delete(key)
    return null
  }
  // Touch to refresh LRU order
  cache.delete(key)
  cache.set(key, entry)
  return entry.persona
}

function cacheSet(key: string, persona: ParsedPersona): void {
  cache.set(key, { persona, expires: Date.now() + CACHE_TTL_MS })
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const blocked = await guardApiRoute(req, { skipBody: true, skipRate: true })
  if (blocked) return blocked

  const id = params.id?.trim()
  if (!id) {
    return NextResponse.json({ success: false, error: 'agent id required' }, { status: 400 })
  }

  const cached = cacheGet(id)
  if (cached) {
    return NextResponse.json({ success: true, persona: cached })
  }

  try {
    const persona = await parsePersona(id)
    cacheSet(id, persona)
    return NextResponse.json({ success: true, persona })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to parse persona'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
