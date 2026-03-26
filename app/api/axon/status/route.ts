import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const AXON_QUEUE_PATH = 'C:\\Users\\bobel\\.openclaw\\workspace-asa1\\state\\task_queue.json'

type AxonQueueTask = {
  id: string
  title: string
  status: 'queued' | 'completed' | string
  created: string
  assigned_by?: string
  source?: string
  project?: string
  intake?: {
    message?: string
  }
  artifacts?: Array<{
    kind: 'folder' | 'image' | 'file'
    path: string
    label?: string
    mimeType?: string
    preview?: string
  }>
}

type AxonQueueState = {
  queue?: AxonQueueTask[]
  completed?: AxonQueueTask[]
  note?: string
}

function normalizeTask(task: AxonQueueTask, statusOverride?: 'queued' | 'completed') {
  return {
    id: task.id,
    title: task.title,
    status: statusOverride ?? (task.status === 'completed' ? 'completed' : 'queued'),
    created: task.created,
    project: task.project ?? 'shared',
    assignedBy: task.assigned_by ?? 'Jarvis / Axon HUD',
    message: task.intake?.message ?? '',
    artifacts: task.artifacts ?? [],
  }
}

function byCreatedDesc(a: { created: string }, b: { created: string }) {
  return new Date(b.created).getTime() - new Date(a.created).getTime()
}

export async function GET() {
  try {
    const raw = await readFile(AXON_QUEUE_PATH, 'utf8')
    const queueState = JSON.parse(raw) as AxonQueueState

    const queued = (queueState.queue ?? [])
      .filter((task) => task.source === 'jarvis-axon-hud')
      .map((task) => normalizeTask(task, 'queued'))
      .sort(byCreatedDesc)

    const completed = (queueState.completed ?? [])
      .filter((task) => task.source === 'jarvis-axon-hud')
      .map((task) => normalizeTask(task, 'completed'))
      .sort(byCreatedDesc)

    return NextResponse.json({
      queued,
      completed,
      totalQueued: queued.length,
      totalCompleted: completed.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        queued: [],
        completed: [],
        totalQueued: 0,
        totalCompleted: 0,
        error: error instanceof Error ? error.message : 'Axon status read failed.',
      },
      { status: 502 },
    )
  }
}
