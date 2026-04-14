/**
 * Mission Pipelines — multi-step orchestration state.
 *
 * Mirrors missionIdeas.ts / missionTasks.ts: atomic rename-write +
 * module-level mutex. This file is pure state management — actual
 * step dispatch (dispatchPipeline) lands in Phase 4.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type {
  MissionPipeline,
  PipelineStatus,
  PipelineStep,
} from '@/types/mission-pipeline'

export const PIPELINES_FILE =
  'C:\\Users\\bobel\\.openclaw\\workspace-vault\\state\\mission-pipelines.json'

export const MAX_PIPELINE_STEPS = 6
const MAX_PIPELINES = 200

interface MissionPipelinesFile {
  version:   number
  owner:     string
  pipelines: MissionPipeline[]
}

const DEFAULT_FILE: MissionPipelinesFile = {
  version:   1,
  owner:     'vault',
  pipelines: [],
}

// Independent single-process mutex
let writeQueue: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn)
  writeQueue = next.catch(() => undefined)
  return next
}

async function ensureFile(): Promise<void> {
  try {
    await readFile(PIPELINES_FILE, 'utf8')
  } catch {
    await mkdir(path.dirname(PIPELINES_FILE), { recursive: true })
    await writeFile(PIPELINES_FILE, JSON.stringify(DEFAULT_FILE, null, 2), 'utf8')
  }
}

async function readPipelinesFile(): Promise<MissionPipelinesFile> {
  await ensureFile()
  const raw = await readFile(PIPELINES_FILE, 'utf8')
  try {
    const parsed = JSON.parse(raw) as MissionPipelinesFile
    if (!parsed.pipelines) parsed.pipelines = []
    return parsed
  } catch {
    await writeFileAtomic({ ...DEFAULT_FILE })
    return { ...DEFAULT_FILE }
  }
}

async function writeFileAtomic(file: MissionPipelinesFile): Promise<void> {
  await mkdir(path.dirname(PIPELINES_FILE), { recursive: true })
  const tmp = `${PIPELINES_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  // Windows EPERM retry — same rationale as missionStream.writeStream
  let attempt = 0
  const MAX_ATTEMPTS = 6
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await rename(tmp, PIPELINES_FILE)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < MAX_ATTEMPTS) {
        attempt++
        await new Promise<void>((r) => setTimeout(r, 40 * attempt))
        continue
      }
      throw err
    }
  }
}

export async function listPipelines(params?: {
  status?: PipelineStatus
  limit?:  number
}): Promise<MissionPipeline[]> {
  const file = await readPipelinesFile()
  let pipelines = file.pipelines
  if (params?.status) pipelines = pipelines.filter((p) => p.status === params.status)
  pipelines = [...pipelines].sort((a, b) => b.updatedAt - a.updatedAt)
  if (params?.limit) pipelines = pipelines.slice(0, params.limit)
  return pipelines
}

export async function getPipeline(id: string): Promise<MissionPipeline | null> {
  const file = await readPipelinesFile()
  return file.pipelines.find((p) => p.id === id) ?? null
}

export interface CreatePipelineInput {
  title:       string
  initiatedBy: string
  steps:       string[]           // agent ids for each step, in order
  template?:   string
}

export async function createPipeline(input: CreatePipelineInput): Promise<MissionPipeline> {
  return withLock(async () => {
    if (!input.steps.length) {
      throw new Error('pipeline requires at least one step')
    }
    if (input.steps.length > MAX_PIPELINE_STEPS) {
      throw new Error(`pipeline cannot exceed ${MAX_PIPELINE_STEPS} steps`)
    }

    const file = await readPipelinesFile()
    const now = Date.now()
    const steps: PipelineStep[] = input.steps.map((agentId) => ({
      agentId,
      status: 'pending',
    }))

    const pipeline: MissionPipeline = {
      id:          randomUUID(),
      title:       input.title.trim().slice(0, 200),
      initiatedBy: input.initiatedBy,
      createdAt:   now,
      updatedAt:   now,
      status:      'queued',
      currentStep: 0,
      steps,
      template:    input.template,
    }

    file.pipelines.push(pipeline)
    if (file.pipelines.length > MAX_PIPELINES) {
      file.pipelines = file.pipelines.slice(-MAX_PIPELINES)
    }
    await writeFileAtomic(file)
    return pipeline
  })
}

async function mutatePipeline(
  id: string,
  mutator: (pipeline: MissionPipeline) => MissionPipeline,
): Promise<MissionPipeline> {
  return withLock(async () => {
    const file = await readPipelinesFile()
    const idx = file.pipelines.findIndex((p) => p.id === id)
    if (idx === -1) {
      throw new Error(`pipeline ${id} not found`)
    }
    const next = mutator(file.pipelines[idx])
    next.updatedAt = Date.now()
    file.pipelines[idx] = next
    await writeFileAtomic(file)
    return next
  })
}

/**
 * Mark the current step completed with its output, advance to the next
 * step, and set pipeline status to 'completed' if no steps remain.
 */
export async function advancePipeline(
  id: string,
  output: string,
): Promise<MissionPipeline> {
  return mutatePipeline(id, (pipeline) => {
    if (pipeline.status === 'completed' || pipeline.status === 'cancelled' || pipeline.status === 'failed') {
      throw new Error(`cannot advance pipeline in status ${pipeline.status}`)
    }
    const stepIdx = pipeline.currentStep
    if (stepIdx < 0 || stepIdx >= pipeline.steps.length) {
      throw new Error(`pipeline ${id} has no current step`)
    }
    const now = Date.now()
    const steps = pipeline.steps.map((step, i) => {
      if (i !== stepIdx) return step
      return {
        ...step,
        status:    'completed' as const,
        startedAt: step.startedAt ?? now,
        endedAt:   now,
        output,
      }
    })
    const nextIndex = stepIdx + 1
    const isLast = nextIndex >= steps.length
    return {
      ...pipeline,
      steps,
      currentStep: isLast ? stepIdx : nextIndex,
      status:      isLast ? 'completed' : 'running',
      finalOutput: isLast ? output : pipeline.finalOutput,
    }
  })
}

/**
 * Mark the current step failed with the error, set pipeline status to
 * 'failed'. No auto-advance.
 */
export async function failPipelineStep(
  id: string,
  error: string,
): Promise<MissionPipeline> {
  return mutatePipeline(id, (pipeline) => {
    const stepIdx = pipeline.currentStep
    if (stepIdx < 0 || stepIdx >= pipeline.steps.length) {
      throw new Error(`pipeline ${id} has no current step`)
    }
    const now = Date.now()
    const steps = pipeline.steps.map((step, i) => {
      if (i !== stepIdx) return step
      return {
        ...step,
        status:    'failed' as const,
        startedAt: step.startedAt ?? now,
        endedAt:   now,
        error,
      }
    })
    return {
      ...pipeline,
      steps,
      status: 'failed',
    }
  })
}

export async function cancelPipeline(id: string): Promise<MissionPipeline> {
  return mutatePipeline(id, (pipeline) => {
    if (pipeline.status === 'completed' || pipeline.status === 'cancelled' || pipeline.status === 'failed') {
      return pipeline
    }
    const steps = pipeline.steps.map((step) => {
      if (step.status === 'pending') {
        return { ...step, status: 'skipped' as const }
      }
      if (step.status === 'running') {
        return { ...step, status: 'skipped' as const, endedAt: Date.now() }
      }
      return step
    })
    return {
      ...pipeline,
      steps,
      status: 'cancelled',
    }
  })
}

/**
 * Insert a new pending step for `agentId` at `insertIdx` (0-indexed).
 * Used for mid-pipeline hand_off insertion. Will not exceed
 * MAX_PIPELINE_STEPS. If insertIdx <= currentStep, currentStep is
 * shifted forward so the running step stays on the same element.
 */
export async function insertStepBefore(
  id: string,
  agentId: string,
  insertIdx: number,
): Promise<MissionPipeline> {
  return mutatePipeline(id, (pipeline) => {
    if (pipeline.steps.length >= MAX_PIPELINE_STEPS) {
      throw new Error(`pipeline already at max ${MAX_PIPELINE_STEPS} steps`)
    }
    const clampedIdx = Math.max(0, Math.min(insertIdx, pipeline.steps.length))
    const newStep: PipelineStep = { agentId, status: 'pending' }
    const steps: PipelineStep[] = [
      ...pipeline.steps.slice(0, clampedIdx),
      newStep,
      ...pipeline.steps.slice(clampedIdx),
    ]
    const nextCurrent =
      clampedIdx <= pipeline.currentStep ? pipeline.currentStep + 1 : pipeline.currentStep
    return {
      ...pipeline,
      steps,
      currentStep: nextCurrent,
    }
  })
}
