/**
 * GET    /api/mission/pipeline                  — list all pipelines
 * GET    /api/mission/pipeline?status=running   — filter by status
 * POST   /api/mission/pipeline                  — create { title, steps[], template? }
 *                                                 (does NOT execute; Phase 4)
 * PATCH  /api/mission/pipeline                  — { id, action, ...args }
 *            actions: advance | cancel | fail | insertStep
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  advancePipeline,
  cancelPipeline,
  createPipeline,
  failPipelineStep,
  getPipeline,
  insertStepBefore,
  listPipelines,
  MAX_PIPELINE_STEPS,
} from '@/lib/missionPipelines'
import { dispatchPipeline } from '@/lib/agentDispatch'
import { guardApiRoute } from '@/lib/apiGuard'
import type { MissionPipeline, PipelineStatus } from '@/types/mission-pipeline'

/**
 * Fire-and-forget pipeline execution. POST and PATCH(resume) both kick this
 * off without awaiting — the HTTP response returns immediately with the
 * queued/running pipeline and the background task updates state as it goes.
 * Any synchronous throw from dispatchPipeline is caught here; async rejects
 * are caught via .catch().
 */
function fireDispatch(pipelineId: string): void {
  try {
    void dispatchPipeline(pipelineId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      // eslint-disable-next-line no-console
      console.error(`[pipeline] dispatch failed for ${pipelineId}:`, message)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error(`[pipeline] dispatch threw synchronously for ${pipelineId}:`, message)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_VALUES = ['queued', 'running', 'completed', 'cancelled', 'failed'] as const
const TEMPLATE_VALUES = ['BUILD', 'LAUNCH', 'QA', 'RESEARCH', 'CUSTOM'] as const

const createSchema = z.object({
  title:    z.string().min(1).max(200),
  steps:    z.array(z.string().min(1).max(40)).min(1).max(MAX_PIPELINE_STEPS),
  template: z.enum(TEMPLATE_VALUES).optional(),
})

const patchBase = z.object({
  id: z.string().min(1).max(80),
})

const advanceSchema = patchBase.extend({
  action: z.literal('advance'),
  output: z.string().min(1).max(8000),
})

const cancelSchema = patchBase.extend({
  action: z.literal('cancel'),
})

const failSchema = patchBase.extend({
  action: z.literal('fail'),
  error:  z.string().min(1).max(2000),
})

const insertSchema = patchBase.extend({
  action:    z.literal('insertStep'),
  agentId:   z.string().min(1).max(40),
  insertIdx: z.number().int().min(0).max(MAX_PIPELINE_STEPS),
})

const resumeSchema = patchBase.extend({
  action: z.literal('resume'),
})

const patchSchema = z.discriminatedUnion('action', [
  advanceSchema,
  cancelSchema,
  failSchema,
  insertSchema,
  resumeSchema,
])

function badRequest(message: string): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req, { skipBody: true, skipRate: true })
  if (blocked) return blocked

  const url = req.nextUrl
  const statusRaw = url.searchParams.get('status')
  const status: PipelineStatus | undefined =
    statusRaw && (STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as PipelineStatus)
      : undefined

  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : undefined

  try {
    const pipelines = await listPipelines({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    return NextResponse.json({ success: true, pipelines })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to list pipelines'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return badRequest('invalid JSON body')
  }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'invalid input')
  }

  try {
    const pipeline = await createPipeline({
      title:       parsed.data.title,
      steps:       parsed.data.steps,
      template:    parsed.data.template,
      initiatedBy: 'bo',
    })
    // Kick off execution in the background. POST returns the queued pipeline
    // immediately — the client polls GET /api/mission/pipeline?status=running
    // (or subscribes to the mission stream) to watch progress.
    fireDispatch(pipeline.id)
    return NextResponse.json({ success: true, pipeline })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to create pipeline'
    return badRequest(message)
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return badRequest('invalid JSON body')
  }

  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'invalid input')
  }

  try {
    let pipeline: MissionPipeline
    switch (parsed.data.action) {
      case 'advance':
        pipeline = await advancePipeline(parsed.data.id, parsed.data.output)
        break
      case 'cancel':
        pipeline = await cancelPipeline(parsed.data.id)
        break
      case 'fail':
        pipeline = await failPipelineStep(parsed.data.id, parsed.data.error)
        break
      case 'insertStep':
        pipeline = await insertStepBefore(
          parsed.data.id,
          parsed.data.agentId,
          parsed.data.insertIdx,
        )
        break
      case 'resume': {
        const existing = await getPipeline(parsed.data.id)
        if (!existing) {
          return NextResponse.json(
            { success: false, error: `pipeline ${parsed.data.id} not found` },
            { status: 404 },
          )
        }
        if (existing.status !== 'queued' && existing.status !== 'running') {
          return badRequest(
            `pipeline ${parsed.data.id} is in status ${existing.status} and cannot be resumed`,
          )
        }
        pipeline = existing
        fireDispatch(existing.id)
        break
      }
      default: {
        const _exhaustive: never = parsed.data
        throw new Error(`Unknown pipeline action: ${JSON.stringify(_exhaustive)}`)
      }
    }
    return NextResponse.json({ success: true, pipeline })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pipeline mutation failed'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
