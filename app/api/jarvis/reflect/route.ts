/**
 * POST /api/jarvis/reflect
 *
 * Runs Jarvis's post-session reflection loop:
 *   1. Send transcript → DeepSeek V3.2 (free) for structured extraction
 *   2. Write daily note entry
 *   3. Merge profile deltas into bo.md
 *   4. Promote or queue each extracted instinct
 *   5. Invalidate the context-injector cache so next turn sees new memory
 *
 * Free-tier only. Never wires paid APIs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ReflectRequestSchema } from '@/lib/jarvis/types'
import { reflect } from '@/lib/jarvis/reflector'
import {
  appendDaily,
  updateBoProfile,
  updateCognitivePatterns,
  promoteInstinct,
} from '@/lib/jarvis/vault'
import { invalidateMemoryCache } from '@/lib/jarvis/context-injector'
import type {
  Instinct,
  Preference,
  Decision,
  Mistake,
  OpenQuestion,
  ProfileDelta,
  CognitivePattern,
} from '@/lib/jarvis/types'

export const runtime = 'nodejs'

function todayYmd(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Flatten the reflection result into a unified Instinct stream. */
function toInstincts(r: {
  facts: ProfileDelta[]
  preferences: Preference[]
  decisions: Decision[]
  mistakes: Mistake[]
  openQuestions: OpenQuestion[]
  cognitivePatterns: CognitivePattern[]
}): Instinct[] {
  const out: Instinct[] = []

  for (const f of r.facts) {
    out.push({
      kind: 'profile',
      title: f.field,
      body: f.value,
      confidence: f.confidence,
      source: 'reflection',
    })
  }

  for (const p of r.preferences) {
    out.push({
      kind: 'preference',
      title: `${p.kind === 'liked' ? 'Likes' : 'Dislikes'}: ${p.about}`,
      body: p.detail,
      confidence: p.confidence,
      source: 'reflection',
    })
  }

  for (const d of r.decisions) {
    out.push({
      kind: 'decision',
      title: d.decision.slice(0, 80),
      body: d.rationale ? `${d.decision}\n\nRationale: ${d.rationale}` : d.decision,
      confidence: d.confidence,
      source: 'reflection',
    })
  }

  for (const m of r.mistakes) {
    out.push({
      kind: 'mistake',
      title: m.mistake.slice(0, 80),
      body: m.avoidance ? `${m.mistake}\n\nAvoid: ${m.avoidance}` : m.mistake,
      confidence: m.confidence,
      source: 'reflection',
    })
  }

  for (const q of r.openQuestions) {
    out.push({
      kind: 'question',
      title: q.question.slice(0, 80),
      body: q.question,
      confidence: q.confidence,
      source: 'reflection',
    })
  }

  return out
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null)
  const parsed = ReflectRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'invalid body', code: 'VALIDATION_FAILED', issues: parsed.error.format() },
      { status: 400 },
    )
  }

  const { transcript, sessionId } = parsed.data

  let result: Awaited<ReturnType<typeof reflect>>
  try {
    result = await reflect(transcript)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'reflector failed'
    // Log server-side for debugging without leaking to the client.
    console.error('[jarvis/reflect] reflector error:', msg)
    return NextResponse.json(
      { success: false, error: 'reflection failed', code: 'REFLECT_UPSTREAM' },
      { status: 502 },
    )
  }

  const date = todayYmd()
  const summaryEntry = [
    sessionId ? `Session: ${sessionId}` : null,
    result.summary ? `Summary: ${result.summary}` : null,
    `Extracted: ${result.facts.length} facts, ${result.preferences.length} prefs, ${result.decisions.length} decisions, ${result.mistakes.length} mistakes, ${result.openQuestions.length} open Qs, ${result.cognitivePatterns.length} cognitive patterns`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    await appendDaily(date, summaryEntry)
  } catch (err) {
    console.error('[jarvis/reflect] appendDaily failed:', err instanceof Error ? err.message : err)
  }

  try {
    await updateBoProfile(result.facts)
  } catch (err) {
    console.error('[jarvis/reflect] updateBoProfile failed:', err instanceof Error ? err.message : err)
  }

  // Process cognitive patterns — write to bo.md section + promote as profile instincts.
  let cognitiveCount = 0
  if (result.cognitivePatterns?.length) {
    try {
      await updateCognitivePatterns(result.cognitivePatterns)
    } catch (err) {
      console.error('[jarvis/reflect] updateCognitivePatterns failed:', err instanceof Error ? err.message : err)
    }

    for (const cp of result.cognitivePatterns) {
      if (cp.confidence >= 0.6) {
        try {
          await promoteInstinct({
            kind: 'profile',
            title: `Bo cognitive pattern: ${cp.pattern}`,
            body: `Evidence: ${cp.evidence}`,
            confidence: cp.confidence,
            source: 'cognitive-reflection',
          })
          cognitiveCount++
        } catch (err) {
          console.error('[jarvis/reflect] cognitive promoteInstinct failed:', err instanceof Error ? err.message : err)
        }
      }
    }
  }

  const instincts = toInstincts(result)
  let promotedCount = 0
  let pendingCount = 0

  for (const instinct of instincts) {
    try {
      const outcome = await promoteInstinct(instinct)
      if (outcome.promoted) promotedCount++
      else pendingCount++
    } catch (err) {
      console.error('[jarvis/reflect] promoteInstinct failed:', err instanceof Error ? err.message : err)
    }
  }

  // Next Jarvis turn should see the freshly-written memory.
  invalidateMemoryCache()

  return NextResponse.json({
    success: true,
    extractedCount: instincts.length,
    promotedCount,
    pendingCount,
    cognitiveCount,
  })
}
