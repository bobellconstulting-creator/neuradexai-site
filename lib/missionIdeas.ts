/**
 * Mission Ideas — agent-originated suggestion queue.
 *
 * Storage mirrors missionTasks.ts: atomic rename-write + module-level
 * mutex. Each idea has status 'fresh' | 'claimed' | 'dismissed'. Bo
 * promotes 'fresh' ideas to real mission tasks and the promotion sets
 * `linkedTaskId` + status 'claimed'.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { IdeaStatus, MissionIdea } from '@/types/mission-idea'

export const IDEAS_FILE =
  'C:\\Users\\bobel\\.openclaw\\workspace-vault\\state\\mission-ideas.json'

const MAX_TITLE = 120
const MAX_BODY = 2000
const MAX_IDEAS = 500

interface MissionIdeasFile {
  version: number
  owner:   string
  ideas:   MissionIdea[]
}

const DEFAULT_FILE: MissionIdeasFile = {
  version: 1,
  owner:   'vault',
  ideas:   [],
}

// Single-process mutex (independent from missionTasks mutex)
let writeQueue: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn)
  writeQueue = next.catch(() => undefined)
  return next
}

async function ensureFile(): Promise<void> {
  try {
    await readFile(IDEAS_FILE, 'utf8')
  } catch {
    await mkdir(path.dirname(IDEAS_FILE), { recursive: true })
    await writeFile(IDEAS_FILE, JSON.stringify(DEFAULT_FILE, null, 2), 'utf8')
  }
}

async function readIdeasFile(): Promise<MissionIdeasFile> {
  await ensureFile()
  const raw = await readFile(IDEAS_FILE, 'utf8')
  try {
    const parsed = JSON.parse(raw) as MissionIdeasFile
    if (!parsed.ideas) parsed.ideas = []
    return parsed
  } catch {
    await writeFileAtomic({ ...DEFAULT_FILE })
    return { ...DEFAULT_FILE }
  }
}

async function writeFileAtomic(file: MissionIdeasFile): Promise<void> {
  await mkdir(path.dirname(IDEAS_FILE), { recursive: true })
  const tmp = `${IDEAS_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  // Windows EPERM retry — same rationale as missionStream.writeStream
  let attempt = 0
  const MAX_ATTEMPTS = 6
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await rename(tmp, IDEAS_FILE)
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

export async function listIdeas(params?: {
  agentId?: string
  status?:  IdeaStatus
  limit?:   number
}): Promise<MissionIdea[]> {
  const file = await readIdeasFile()
  let ideas = file.ideas
  if (params?.agentId) ideas = ideas.filter((i) => i.agentId === params.agentId)
  if (params?.status) ideas = ideas.filter((i) => i.status === params.status)
  // Newest first
  ideas = [...ideas].sort((a, b) => b.updatedAt - a.updatedAt)
  if (params?.limit) ideas = ideas.slice(0, params.limit)
  return ideas
}

export async function getIdea(id: string): Promise<MissionIdea | null> {
  const file = await readIdeasFile()
  return file.ideas.find((i) => i.id === id) ?? null
}

export interface CreateIdeaInput {
  agentId: string
  title:   string
  body:    string
  tags?:   string[]
}

export async function createIdea(input: CreateIdeaInput): Promise<MissionIdea> {
  return withLock(async () => {
    const file = await readIdeasFile()
    const now = Date.now()
    const title = input.title.trim().slice(0, MAX_TITLE)
    const body = input.body.trim().slice(0, MAX_BODY)
    const idea: MissionIdea = {
      id:        randomUUID(),
      agentId:   input.agentId,
      title,
      body,
      createdAt: now,
      updatedAt: now,
      status:    'fresh',
      tags:      input.tags?.slice(0, 20),
    }
    file.ideas.push(idea)
    if (file.ideas.length > MAX_IDEAS) file.ideas = file.ideas.slice(-MAX_IDEAS)
    await writeFileAtomic(file)
    return idea
  })
}

export async function updateIdea(
  id: string,
  patch: Partial<Omit<MissionIdea, 'id' | 'createdAt'>>,
): Promise<MissionIdea> {
  return withLock(async () => {
    const file = await readIdeasFile()
    const idx = file.ideas.findIndex((i) => i.id === id)
    if (idx === -1) {
      throw new Error(`idea ${id} not found`)
    }
    const existing = file.ideas[idx]
    const nextTitle =
      typeof patch.title === 'string' ? patch.title.trim().slice(0, MAX_TITLE) : existing.title
    const nextBody =
      typeof patch.body === 'string' ? patch.body.trim().slice(0, MAX_BODY) : existing.body
    const updated: MissionIdea = {
      ...existing,
      ...patch,
      id:        existing.id,
      createdAt: existing.createdAt,
      title:     nextTitle,
      body:      nextBody,
      updatedAt: Date.now(),
    }
    file.ideas[idx] = updated
    await writeFileAtomic(file)
    return updated
  })
}

export async function deleteIdea(id: string): Promise<boolean> {
  return withLock(async () => {
    const file = await readIdeasFile()
    const before = file.ideas.length
    file.ideas = file.ideas.filter((i) => i.id !== id)
    if (file.ideas.length === before) return false
    await writeFileAtomic(file)
    return true
  })
}
