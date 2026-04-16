/**
 * Mission Tasks — autonomous work queue for the fleet.
 *
 * Storage lives alongside the mission stream in Vault's workspace. Atomic
 * rename-write + module-level mutex to prevent races. Tasks are the proof
 * surface for "what's getting done" — every task carries status + optional
 * proof (URL, path, or quote) so Bo can scan the HUD and see outcomes
 * instead of chat history.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const MISSION_TASKS_PATH =
  'C:\\Users\\bobel\\.openclaw\\workspace-vault\\state\\mission-tasks.json'

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'blocked' | 'awaiting_approval'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export interface MissionTask {
  id:          string
  title:       string
  description: string
  assignedTo:  string          // agent id, or 'unassigned'
  createdBy:   string          // 'bo' | agent id | 'system'
  status:      TaskStatus
  priority:    TaskPriority
  revenue:     boolean         // true if this task directly moves money
  createdAt:   number
  updatedAt:   number
  proof?:      string          // URL, file path, or verified quote on done
  agentReport?: string         // the agent's final message / output
  blockedReason?: string
  approvalPayload?: string     // draft content waiting for Bo's approval
}

export interface MissionTasksFile {
  version: number
  owner:   string
  tasks:   MissionTask[]
}

const DEFAULT_FILE: MissionTasksFile = {
  version: 1,
  owner:   'vault',
  tasks:   [],
}

// Single-process mutex
let writeQueue: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn)
  writeQueue = next.catch(() => undefined)
  return next
}

async function ensureFile(): Promise<void> {
  try {
    await readFile(MISSION_TASKS_PATH, 'utf8')
  } catch {
    await mkdir(path.dirname(MISSION_TASKS_PATH), { recursive: true })
    await writeFile(MISSION_TASKS_PATH, JSON.stringify(DEFAULT_FILE, null, 2), 'utf8')
  }
}

export async function readTasksFile(): Promise<MissionTasksFile> {
  await ensureFile()
  const raw = await readFile(MISSION_TASKS_PATH, 'utf8')
  try {
    const parsed = JSON.parse(raw) as MissionTasksFile
    if (!parsed.tasks) parsed.tasks = []
    return parsed
  } catch {
    await writeFileAtomic({ ...DEFAULT_FILE })
    return { ...DEFAULT_FILE }
  }
}

async function writeFileAtomic(file: MissionTasksFile): Promise<void> {
  await mkdir(path.dirname(MISSION_TASKS_PATH), { recursive: true })
  const tmp = `${MISSION_TASKS_PATH}.tmp`
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  await rename(tmp, MISSION_TASKS_PATH)
}

export async function createTask(
  partial: Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<MissionTask> {
  return withLock(async () => {
    const file = await readTasksFile()
    const now = Date.now()
    const task: MissionTask = {
      id:         partial.id ?? randomUUID(),
      createdAt:  now,
      updatedAt:  now,
      title:      partial.title,
      description: partial.description,
      assignedTo: partial.assignedTo,
      createdBy:  partial.createdBy,
      status:     partial.status ?? 'open',
      priority:   partial.priority ?? 'medium',
      revenue:    partial.revenue ?? false,
      proof:      partial.proof,
      agentReport: partial.agentReport,
      blockedReason: partial.blockedReason,
    }
    file.tasks.push(task)
    if (file.tasks.length > 500) file.tasks = file.tasks.slice(-500)
    await writeFileAtomic(file)
    return task
  })
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<MissionTask, 'id' | 'createdAt'>>,
): Promise<MissionTask | null> {
  return withLock(async () => {
    const file = await readTasksFile()
    const idx = file.tasks.findIndex((t) => t.id === id)
    if (idx === -1) return null
    const updated: MissionTask = {
      ...file.tasks[idx],
      ...patch,
      id:        file.tasks[idx].id,
      createdAt: file.tasks[idx].createdAt,
      updatedAt: Date.now(),
    }
    file.tasks[idx] = updated
    await writeFileAtomic(file)
    return updated
  })
}

export async function listTasks(params?: {
  assignedTo?: string
  status?:     TaskStatus
  limit?:      number
}): Promise<MissionTask[]> {
  const file = await readTasksFile()
  let tasks = file.tasks
  if (params?.assignedTo) tasks = tasks.filter((t) => t.assignedTo === params.assignedTo)
  if (params?.status) tasks = tasks.filter((t) => t.status === params.status)
  // Sort: revenue-tagged first, then by priority, then by updatedAt desc
  const PRI_RANK: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  tasks = [...tasks].sort((a, b) => {
    if (a.revenue !== b.revenue) return a.revenue ? -1 : 1
    if (a.priority !== b.priority) return PRI_RANK[a.priority] - PRI_RANK[b.priority]
    return b.updatedAt - a.updatedAt
  })
  if (params?.limit) tasks = tasks.slice(0, params.limit)
  return tasks
}
