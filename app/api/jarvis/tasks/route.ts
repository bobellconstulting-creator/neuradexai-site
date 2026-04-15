/**
 * GET  /api/jarvis/tasks?status=open  — list tasks (default: open + in_progress)
 * POST /api/jarvis/tasks              — create task { title, description?, priority? }
 * PATCH /api/jarvis/tasks             — update task { id, status, proof? }
 *
 * Thin wrapper around lib/missionTasks for the mobile app. Bypasses the full
 * agent dispatch pipeline in /api/mission/tasks — no runAgentOnTask side effects.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createTask,
  listTasks,
  updateTask,
  type MissionTask,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/missionTasks'
import { appendDaily } from '@/lib/jarvis/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// ──────────────────────────────────────────────────────────────────────────
// Validation schemas
// ──────────────────────────────────────────────────────────────────────────

const postBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
})

const patchBodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(['open', 'in_progress', 'done', 'blocked']),
  proof: z.string().max(500).optional(),
})

const validStatuses = new Set<string>(['open', 'in_progress', 'done', 'blocked', 'all'])

// ──────────────────────────────────────────────────────────────────────────
// GET
// ──────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const statusParam = req.nextUrl.searchParams.get('status') ?? 'open'

    let tasks: MissionTask[]

    if (!validStatuses.has(statusParam)) {
      return NextResponse.json({ ok: false, error: 'invalid status' }, { status: 400 })
    }

    if (statusParam === 'all') {
      tasks = await listTasks()
    } else if (statusParam === 'open') {
      // Mobile default: show open + in_progress together
      const [open, inProgress] = await Promise.all([
        listTasks({ status: 'open' }),
        listTasks({ status: 'in_progress' }),
      ])
      tasks = [...open, ...inProgress]
    } else {
      tasks = await listTasks({ status: statusParam as TaskStatus })
    }

    return NextResponse.json({ ok: true, tasks })
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST
// ──────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null)
  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    )
  }

  try {
    const { title, description, priority } = parsed.data

    const task = await createTask({
      title,
      description: description ?? '',
      assignedTo: 'jarvis',
      createdBy: 'bo',
      status: 'open',
      priority: (priority ?? 'medium') as TaskPriority,
      revenue: false,
    })

    // Best-effort COG daily note write — never fails the response
    try {
      await appendDaily(todayDate(), `- Task created: ${title} [${task.id}]`)
    } catch {
      // vault write failure is non-fatal
    }

    return NextResponse.json({ ok: true, task })
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH
// ──────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null)
  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    )
  }

  try {
    const { id, status, proof } = parsed.data
    const updated = await updateTask(id, { status: status as TaskStatus, proof })
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'task not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, task: updated })
  } catch (err) {
    return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 500 })
  }
}
