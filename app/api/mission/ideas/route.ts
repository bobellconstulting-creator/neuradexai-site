/**
 * GET    /api/mission/ideas                — list all ideas (newest first)
 * GET    /api/mission/ideas?agent=X        — filter by agent
 * GET    /api/mission/ideas?status=fresh   — filter by status
 * POST   /api/mission/ideas                — create { agentId, title, body, tags? }
 * PATCH  /api/mission/ideas                — update { id, ...patch }
 * DELETE /api/mission/ideas                — remove { id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createIdea,
  deleteIdea,
  listIdeas,
  updateIdea,
} from '@/lib/missionIdeas'
import { guardApiRoute } from '@/lib/apiGuard'
import type { IdeaStatus, MissionIdea } from '@/types/mission-idea'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_VALUES = ['fresh', 'claimed', 'dismissed'] as const

const createSchema = z.object({
  agentId: z.string().min(1).max(40),
  title:   z.string().min(1).max(120),
  body:    z.string().min(1).max(2000),
  tags:    z.array(z.string().min(1).max(40)).max(20).optional(),
})

const patchSchema = z.object({
  id:           z.string().min(1).max(80),
  agentId:      z.string().min(1).max(40).optional(),
  title:        z.string().min(1).max(120).optional(),
  body:         z.string().min(1).max(2000).optional(),
  status:       z.enum(STATUS_VALUES).optional(),
  linkedTaskId: z.string().min(1).max(80).optional(),
  tags:         z.array(z.string().min(1).max(40)).max(20).optional(),
})

const deleteSchema = z.object({
  id: z.string().min(1).max(80),
})

function errorResponse(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req, { skipBody: true, skipRate: true })
  if (blocked) return blocked

  const url = req.nextUrl
  const agent = url.searchParams.get('agent') ?? undefined
  const statusRaw = url.searchParams.get('status')
  const status: IdeaStatus | undefined =
    statusRaw && (STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as IdeaStatus)
      : undefined

  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : undefined

  try {
    const ideas = await listIdeas({
      agentId: agent,
      status,
      limit:   Number.isFinite(limit) ? limit : undefined,
    })
    return NextResponse.json({ success: true, ideas })
  } catch (err) {
    return errorResponse(err, 'failed to list ideas')
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }

  try {
    const idea = await createIdea(parsed.data)
    return NextResponse.json({ success: true, idea })
  } catch (err) {
    return errorResponse(err, 'failed to create idea')
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }

  const { id, ...rest } = parsed.data
  const patch: Partial<MissionIdea> = rest

  try {
    const idea = await updateIdea(id, patch)
    return NextResponse.json({ success: true, idea })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to update idea'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const blocked = await guardApiRoute(req)
  if (blocked) return blocked

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = deleteSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }

  try {
    const removed = await deleteIdea(parsed.data.id)
    if (!removed) {
      return NextResponse.json({ success: false, error: 'idea not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err, 'failed to delete idea')
  }
}
