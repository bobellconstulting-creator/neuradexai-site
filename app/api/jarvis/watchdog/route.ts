/**
 * GET /api/jarvis/watchdog
 *
 * Vercel cron — fires every 5 minutes.
 * Checks Jarvis's critical systems and pings Bo on Telegram if anything is down.
 *
 * Checks:
 *   1. Groq API health (primary LLM provider)
 *   2. Telegram bot API reachability
 *   3. Bridge/tunnel health (PC-local, expected to be offline when PC off)
 *
 * Alert policy:
 *   - Groq down → INCIDENT alert (Jarvis can't think)
 *   - Telegram down → logged only (can't alert if Telegram is down)
 *   - Bridge offline → single alert per session (expected when PC off)
 *
 * Quiet hours: 23:00–06:00 CT. Non-emergency alerts suppressed.
 * Emergency override: Groq+Gemini both down fires regardless of quiet hours.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramText, getOwnerChatId } from '@/lib/jarvis/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CRON_SECRET      = process.env.CRON_SECRET
const GROQ_API_KEY     = process.env.GROQ_API_KEY ?? ''
const GOOGLE_API_KEY   = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? ''
const BRIDGE_URL       = process.env.JARVIS_BRIDGE_URL ?? ''

const BRIDGE_TIMEOUT_MS  = 4_000
const PROVIDER_TIMEOUT_MS = 8_000

// CT offset: CDT = UTC-5, CST = UTC-6. Use -5 as conservative (CDT).
function ctHour(): number {
  return (new Date().getUTCHours() - 5 + 24) % 24
}

function isQuietHours(): boolean {
  const h = ctHour()
  return h >= 23 || h < 6
}

// ── Provider health checks ────────────────────────────────────────────────────

async function checkGroq(): Promise<{ ok: boolean; error?: string }> {
  if (!GROQ_API_KEY) return { ok: false, error: 'GROQ_API_KEY not set' }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `Groq HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function checkGemini(): Promise<{ ok: boolean; error?: string }> {
  if (!GOOGLE_API_KEY) return { ok: false, error: 'GOOGLE_API_KEY not set' }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_API_KEY}`,
      { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
    )
    if (!res.ok) return { ok: false, error: `Gemini HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function checkBridge(): Promise<{ ok: boolean; error?: string }> {
  if (!BRIDGE_URL) return { ok: false, error: 'JARVIS_BRIDGE_URL not configured' }
  try {
    const res = await fetch(`${BRIDGE_URL}/api/jarvis/tool`, {
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `Bridge HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const quiet = isQuietHours()
  const chatId = getOwnerChatId()

  // Run all checks in parallel
  const [groq, gemini, bridge] = await Promise.all([
    checkGroq(),
    checkGemini(),
    checkBridge(),
  ])

  const results = { groq, gemini, bridge }
  const allProvidersDown = !groq.ok && !gemini.ok

  // ── Alert logic ────────────────────────────────────────────────────────────

  const alerts: string[] = []

  // Both primary providers down — emergency, overrides quiet hours
  if (allProvidersDown) {
    alerts.push(
      `INCIDENT: all LLM providers down. Groq: ${groq.error ?? 'fail'}. Gemini: ${gemini.error ?? 'fail'}. Jarvis cannot respond.`,
    )
  } else if (!groq.ok && !quiet) {
    alerts.push(`WATCHING: Groq degraded — ${groq.error ?? 'fail'}. Gemini holding primary.`)
  } else if (!gemini.ok && !quiet) {
    alerts.push(`WATCHING: Gemini degraded — ${gemini.error ?? 'fail'}. Groq holding primary.`)
  }

  // Bridge offline — alert once, non-emergency, respects quiet hours
  if (!bridge.ok && !quiet) {
    alerts.push(`WATCHING: bridge offline (PC likely off). Local tools unavailable. ${bridge.error ?? ''}`.trim())
  }

  // Send alerts
  for (const msg of alerts) {
    await sendTelegramText(chatId, msg)
  }

  console.log('[watchdog]', JSON.stringify({ groq: groq.ok, gemini: gemini.ok, bridge: bridge.ok, alerts: alerts.length, quiet }))

  return NextResponse.json({
    ok: true,
    checks: results,
    alerts_sent: alerts.length,
    quiet_hours: quiet,
  })
}
