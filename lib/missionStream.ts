/**
 * Mission Stream — shared communal chat state.
 *
 * Storage lives in Vault's workspace, because Vault owns the fleet's memory.
 * File format is a single JSON doc with atomic rename-write.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const MISSION_STREAM_PATH =
  'C:\\Users\\bobel\\.openclaw\\workspace-vault\\state\\mission-stream.json'

export type MessageRole = 'user' | 'agent' | 'system' | 'tool'
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error'
export type MessageVisibility = 'communal' | 'private'

export interface MissionMessage {
  id:         string
  ts:         number
  agentId:    string         // 'bo' for user, otherwise agent id
  role:       MessageRole
  content:    string
  mentions:   string[]       // agent ids mentioned via @name
  replyTo:    string | null
  status:     MessageStatus
  visibility: MessageVisibility
  toolCalls?: Array<{ name: string; args: unknown; result?: unknown }>
}

export interface MissionStreamFile {
  version:  number
  owner:    string
  messages: MissionMessage[]
}

const DEFAULT_FILE: MissionStreamFile = {
  version: 1,
  owner:   'vault',
  messages: [],
}

// ── Single-process write mutex ──────────────────────────────────────────────
// All mutations serialize through this promise chain so concurrent
// append/update calls never race on the JSON file. Reads are safe outside
// the lock because writes are atomic-rename.
let writeQueue: Promise<unknown> = Promise.resolve()

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn)
  writeQueue = next.catch(() => undefined)
  return next
}

async function ensureFile(): Promise<void> {
  try {
    await readFile(MISSION_STREAM_PATH, 'utf8')
  } catch {
    await mkdir(path.dirname(MISSION_STREAM_PATH), { recursive: true })
    await writeFile(MISSION_STREAM_PATH, JSON.stringify(DEFAULT_FILE, null, 2), 'utf8')
  }
}

export async function readStream(): Promise<MissionStreamFile> {
  await ensureFile()
  const raw = await readFile(MISSION_STREAM_PATH, 'utf8')
  try {
    const parsed = JSON.parse(raw) as MissionStreamFile
    if (!parsed.messages) parsed.messages = []
    return parsed
  } catch {
    // Corrupt file — rewrite with empty default to self-heal
    await writeStream({ ...DEFAULT_FILE })
    return { ...DEFAULT_FILE }
  }
}

async function writeStream(file: MissionStreamFile): Promise<void> {
  await mkdir(path.dirname(MISSION_STREAM_PATH), { recursive: true })
  const tmp = `${MISSION_STREAM_PATH}.tmp`
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  await rename(tmp, MISSION_STREAM_PATH)
}

export function extractMentions(content: string, validIds: ReadonlyArray<string>): string[] {
  const found = new Set<string>()
  const re = /@([a-z0-9_-]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const id = m[1].toLowerCase()
    if (validIds.includes(id)) found.add(id)
  }
  return Array.from(found)
}

export async function appendMessage(
  partial: Omit<MissionMessage, 'id' | 'ts'> & { id?: string; ts?: number },
): Promise<MissionMessage> {
  return withWriteLock(async () => {
    const file = await readStream()
    const msg: MissionMessage = {
      id:         partial.id ?? randomUUID(),
      ts:         partial.ts ?? Date.now(),
      agentId:    partial.agentId,
      role:       partial.role,
      content:    partial.content,
      mentions:   partial.mentions ?? [],
      replyTo:    partial.replyTo ?? null,
      status:     partial.status ?? 'done',
      visibility: partial.visibility ?? 'communal',
      toolCalls:  partial.toolCalls,
    }
    file.messages.push(msg)
    if (file.messages.length > 500) {
      file.messages = file.messages.slice(-500)
    }
    await writeStream(file)
    return msg
  })
}

export async function updateMessage(
  id: string,
  patch: Partial<Omit<MissionMessage, 'id' | 'ts'>>,
): Promise<MissionMessage | null> {
  return withWriteLock(async () => {
    const file = await readStream()
    const idx = file.messages.findIndex((m) => m.id === id)
    if (idx === -1) return null
    const merged: MissionMessage = { ...file.messages[idx], ...patch, id, ts: file.messages[idx].ts }
    file.messages[idx] = merged
    await writeStream(file)
    return merged
  })
}

export async function listMessages(params?: {
  agentId?: string
  limit?: number
  sinceTs?: number
}): Promise<MissionMessage[]> {
  const file = await readStream()
  let msgs = file.messages
  if (params?.sinceTs !== undefined) {
    msgs = msgs.filter((m) => m.ts > params.sinceTs!)
  }
  if (params?.agentId) {
    const id = params.agentId
    msgs = msgs.filter(
      (m) =>
        m.agentId === id ||
        m.mentions.includes(id) ||
        (m.agentId === 'bo' && m.mentions.includes(id)),
    )
  }
  if (params?.limit) {
    msgs = msgs.slice(-params.limit)
  }
  return msgs
}
