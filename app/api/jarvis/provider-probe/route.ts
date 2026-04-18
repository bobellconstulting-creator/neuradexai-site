/**
 * GET /api/jarvis/provider-probe
 * Hits each provider individually and returns per-provider health.
 * Unauthenticated — read-only health check, no sensitive data returned.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const GROQ_API_KEY    = process.env.GROQ_API_KEY ?? ''
const GOOGLE_API_KEY  = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? ''
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY ?? ''
const NVIDIA_API_KEY  = process.env.NVIDIA_API_KEY ?? ''

const TIMEOUT_MS = 8000

interface ProbeResult {
  provider: string
  model: string
  ok: boolean
  latencyMs: number
  error?: string
}

async function probeGroq(): Promise<ProbeResult> {
  const start = Date.now()
  try {
    if (!GROQ_API_KEY) return { provider: 'groq', model: 'llama-3.3-70b-versatile', ok: false, latencyMs: 0, error: 'no key' }
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { provider: 'groq', model: 'llama-3.3-70b-versatile', ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { provider: 'groq', model: 'llama-3.3-70b-versatile', ok: false, latencyMs: Date.now() - start, error: String(e) }
  }
}

async function probeGemini(): Promise<ProbeResult> {
  const start = Date.now()
  try {
    if (!GOOGLE_API_KEY) return { provider: 'gemini', model: 'gemini-2.5-flash', ok: false, latencyMs: 0, error: 'no key' }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    )
    return { provider: 'gemini', model: 'gemini-2.5-flash', ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { provider: 'gemini', model: 'gemini-2.5-flash', ok: false, latencyMs: Date.now() - start, error: String(e) }
  }
}

async function probeOpenRouter(): Promise<ProbeResult> {
  const start = Date.now()
  try {
    if (!OPENROUTER_KEY) return { provider: 'openrouter', model: 'llama-3.3-70b-instruct:free', ok: false, latencyMs: 0, error: 'no key' }
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'meta-llama/llama-3.3-70b-instruct:free', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { provider: 'openrouter', model: 'llama-3.3-70b-instruct:free', ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { provider: 'openrouter', model: 'llama-3.3-70b-instruct:free', ok: false, latencyMs: Date.now() - start, error: String(e) }
  }
}

async function probeNvidia(): Promise<ProbeResult> {
  const start = Date.now()
  try {
    if (!NVIDIA_API_KEY) return { provider: 'nvidia', model: 'deepseek-v3.2', ok: false, latencyMs: 0, error: 'no key' }
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-ai/deepseek-v3.2', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { provider: 'nvidia', model: 'deepseek-v3.2', ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { provider: 'nvidia', model: 'deepseek-v3.2', ok: false, latencyMs: Date.now() - start, error: String(e) }
  }
}

export async function GET(): Promise<NextResponse> {
  const results = await Promise.allSettled([probeGroq(), probeGemini(), probeOpenRouter(), probeNvidia()])
  const probes: ProbeResult[] = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { provider: 'unknown', model: 'unknown', ok: false, latencyMs: 0, error: 'probe threw' }
  )
  const allDown = probes.every((p) => !p.ok)
  return NextResponse.json({ ok: !allDown, probes, ts: new Date().toISOString() })
}
