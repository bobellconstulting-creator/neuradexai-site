/**
 * Jarvis task tools — create, list, and complete mission tasks.
 *
 * Follows the exact pattern from tools.ts: Zod schema, ToolResult<T>,
 * mkReceipt + appendReceipt to jarvis-tool-log.md, appendDaily to COG.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { createTask, listTasks, updateTask } from '@/lib/missionTasks'
import type { MissionTask, TaskStatus } from '@/lib/missionTasks'
import { appendDaily } from '@/lib/jarvis/vault'
import type { ToolResult } from '@/lib/jarvis/tools'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'

// ──────────────────────────────────────────────────────────────────────────
// Utilities (mirrors tools.ts)
// ──────────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error: ' + String(error)
}

function mkReceipt(tool: string, ok: boolean, detail: string): string {
  return `[${now()}] ${tool} ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Log sink must never break the tool — swallow silently.
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────────────────────────

export const createJarvisTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
})
export type CreateJarvisTaskArgs = z.infer<typeof createJarvisTaskSchema>

export const listJarvisTasksSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'blocked', 'all']).optional(),
})
export type ListJarvisTasksArgs = z.infer<typeof listJarvisTasksSchema>

export const completeJarvisTaskSchema = z.object({
  taskId: z.string().min(1),
  proof: z.string().max(500).optional(),
})
export type CompleteJarvisTaskArgs = z.infer<typeof completeJarvisTaskSchema>

// ──────────────────────────────────────────────────────────────────────────
// Tool: createJarvisTask
// ──────────────────────────────────────────────────────────────────────────

interface CreateJarvisTaskResult {
  taskId: string
  title: string
}

export async function createJarvisTask(
  raw: unknown,
): Promise<ToolResult<CreateJarvisTaskResult>> {
  const parsed = createJarvisTaskSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('createJarvisTask', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { title, description, priority } = parsed.data

  try {
    const task = await createTask({
      title,
      description: description ?? '',
      assignedTo: 'jarvis',
      createdBy: 'jarvis',
      status: 'open',
      priority: priority ?? 'medium',
      revenue: false,
    })

    // Write a one-liner to today's COG daily note — best effort
    try {
      await appendDaily(todayDate(), `- Task created: ${title} [${task.id}]`)
    } catch {
      // vault write failure must not fail the tool
    }

    const r = mkReceipt('createJarvisTask', true, `id=${task.id} title="${title.slice(0, 80)}"`)
    await appendReceipt(r)
    return { ok: true, result: { taskId: task.id, title: task.title }, receipt: r }
  } catch (err) {
    const r = mkReceipt('createJarvisTask', false, getErrorMessage(err))
    await appendReceipt(r)
    return { ok: false, error: getErrorMessage(err), receipt: r }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tool: listJarvisTasks
// ──────────────────────────────────────────────────────────────────────────

interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  priority: MissionTask['priority']
  createdAt: number
}

interface ListJarvisTasksResult {
  tasks: TaskSummary[]
}

export async function listJarvisTasks(
  raw: unknown,
): Promise<ToolResult<ListJarvisTasksResult>> {
  const parsed = listJarvisTasksSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('listJarvisTasks', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { status } = parsed.data

  try {
    let allTasks: MissionTask[]

    if (!status || status === 'all') {
      allTasks = await listTasks()
    } else if (status === 'open' || status === 'in_progress') {
      // Default: fetch both open + in_progress
      const [open, inProgress] = await Promise.all([
        listTasks({ status: 'open' }),
        listTasks({ status: 'in_progress' }),
      ])
      allTasks = [...open, ...inProgress]
    } else {
      allTasks = await listTasks({ status: status as TaskStatus })
    }

    // Default (no explicit status arg): open + in_progress only
    if (!status) {
      const [open, inProgress] = await Promise.all([
        listTasks({ status: 'open' }),
        listTasks({ status: 'in_progress' }),
      ])
      allTasks = [...open, ...inProgress]
    }

    const tasks: TaskSummary[] = allTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
    }))

    const r = mkReceipt('listJarvisTasks', true, `count=${tasks.length} status=${status ?? 'open+in_progress'}`)
    await appendReceipt(r)
    return { ok: true, result: { tasks }, receipt: r }
  } catch (err) {
    const r = mkReceipt('listJarvisTasks', false, getErrorMessage(err))
    await appendReceipt(r)
    return { ok: false, error: getErrorMessage(err), receipt: r }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tool: completeJarvisTask
// ──────────────────────────────────────────────────────────────────────────

interface CompleteJarvisTaskResult {
  taskId: string
}

export async function completeJarvisTask(
  raw: unknown,
): Promise<ToolResult<CompleteJarvisTaskResult>> {
  const parsed = completeJarvisTaskSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('completeJarvisTask', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { taskId, proof } = parsed.data

  try {
    const updated = await updateTask(taskId, { status: 'done', proof })
    if (!updated) {
      const r = mkReceipt('completeJarvisTask', false, `task not found: ${taskId}`)
      await appendReceipt(r)
      return { ok: false, error: `task not found: ${taskId}`, receipt: r }
    }

    const r = mkReceipt('completeJarvisTask', true, `taskId=${taskId} proof=${proof ?? 'none'}`)
    await appendReceipt(r)
    return { ok: true, result: { taskId }, receipt: r }
  } catch (err) {
    const r = mkReceipt('completeJarvisTask', false, getErrorMessage(err))
    await appendReceipt(r)
    return { ok: false, error: getErrorMessage(err), receipt: r }
  }
}
