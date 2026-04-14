/**
 * GET  /api/mission/tasks                — list all (sorted revenue-first)
 * GET  /api/mission/tasks?agent=X        — filter to one agent
 * GET  /api/mission/tasks?status=open    — filter by status
 * POST /api/mission/tasks                — create a task
 * PATCH /api/mission/tasks?id=XXX        — update (status, proof, report)
 *
 * On create: if assignedTo is set and != 'unassigned', fire the dispatcher
 * asynchronously so the agent works on it immediately. When the agent
 * returns, update the task row with status + proof + agentReport.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createTask, listTasks, readTasksFile, updateTask, type MissionTask, type TaskPriority } from '@/lib/missionTasks'
import { appendMessage, listMessages } from '@/lib/missionStream'
import { officeChannel, type MissionMessage } from '@/lib/missionChannels'
import { dispatchAgent } from '@/lib/agentDispatch'
import { AGENTS, getAgent } from '@/lib/agents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_IDS = AGENTS.map((a) => a.id)

async function runAgentOnTask(taskId: string, agentId: string, taskBrief: string): Promise<void> {
  try {
    // Mark task in progress
    await updateTask(taskId, { status: 'in_progress' })

    // Give the agent fresh context + an explicit task brief
    const history = await listMessages({ limit: 40 })

    // Inject a synthetic brief into the history so the agent sees the task directly
    const briefMessage = `TASK BRIEF (from Bo, task ${taskId}):\n${taskBrief}\n\nRespond with ONE of: (a) the final result plus a URL/path/quote as proof, (b) "BLOCKED: <exact reason>", or (c) "DONE: <one-line summary>" if no artifact is needed. Do not narrate. Do not ask clarifying questions.`
    const syntheticBrief: MissionMessage = {
      id:         `brief-${taskId}`,
      ts:         Date.now(),
      agentId:    'bo',
      role:       'user',
      content:    briefMessage,
      mentions:   [agentId],
      replyTo:    null,
      status:     'done',
      visibility: 'private',
      channel:    officeChannel(agentId),
    }
    const augmented: MissionMessage[] = [...history, syntheticBrief]

    const { content: reply } = await dispatchAgent(agentId, augmented)
    const trimmed = reply.trim()

    // Parse intent from the reply
    let status: MissionTask['status'] = 'done'
    let blockedReason: string | undefined
    let proof: string | undefined

    if (/^BLOCKED\b/i.test(trimmed)) {
      status = 'blocked'
      blockedReason = trimmed.replace(/^BLOCKED:?\s*/i, '').split('\n')[0].slice(0, 200)
    } else {
      // Try to auto-extract a URL as proof if present
      const urlMatch = trimmed.match(/https?:\/\/\S+/)
      if (urlMatch) proof = urlMatch[0]
    }

    await updateTask(taskId, {
      status,
      agentReport: trimmed,
      proof,
      blockedReason,
    })

    // Also log the reply to the communal stream for context
    await appendMessage({
      agentId,
      role:       'agent',
      content:    `[task ${taskId.slice(0, 8)}] ${trimmed}`,
      mentions:   [],
      replyTo:    null,
      status:     'done',
      visibility: 'communal',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'dispatch failed'
    await updateTask(taskId, {
      status: 'blocked',
      blockedReason: msg,
    })
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const agent = url.searchParams.get('agent') ?? undefined
  const status = url.searchParams.get('status') as MissionTask['status'] | null
  const limit = Number(url.searchParams.get('limit') ?? '200')

  const tasks = await listTasks({
    assignedTo: agent,
    status: status ?? undefined,
    limit: Number.isFinite(limit) ? limit : 200,
  })

  // Also compute simple counts for the HUD
  const file = await readTasksFile()
  const counts = {
    total:       file.tasks.length,
    open:        file.tasks.filter((t) => t.status === 'open').length,
    in_progress: file.tasks.filter((t) => t.status === 'in_progress').length,
    done:        file.tasks.filter((t) => t.status === 'done').length,
    blocked:     file.tasks.filter((t) => t.status === 'blocked').length,
    revenue:     file.tasks.filter((t) => t.revenue).length,
  }

  return NextResponse.json({ ok: true, tasks, counts })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<MissionTask> | null
  const title = body?.title?.trim()
  if (!title) {
    return NextResponse.json({ ok: false, error: 'title required' }, { status: 400 })
  }

  const description = body?.description?.trim() ?? ''
  const assignedTo = body?.assignedTo?.trim() ?? 'unassigned'
  const priority: TaskPriority = (body?.priority as TaskPriority) ?? 'medium'
  const revenue = Boolean(body?.revenue)

  const task = await createTask({
    title,
    description,
    assignedTo,
    createdBy: body?.createdBy ?? 'bo',
    status:    'open',
    priority,
    revenue,
  })

  // Autonomous dispatch if assigned to a real agent
  if (assignedTo !== 'unassigned' && VALID_IDS.includes(assignedTo)) {
    const brief = description ? `${title}\n\n${description}` : title
    void runAgentOnTask(task.id, assignedTo, brief)
  }

  return NextResponse.json({ ok: true, task })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const patch = (await req.json().catch(() => null)) as Partial<MissionTask> | null
  if (!patch) return NextResponse.json({ ok: false, error: 'body required' }, { status: 400 })

  const updated = await updateTask(id, patch)
  if (!updated) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  return NextResponse.json({ ok: true, task: updated })
}
