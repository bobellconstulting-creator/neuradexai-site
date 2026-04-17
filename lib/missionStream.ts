/**
 * Mission Stream — shared communal chat state.
 *
 * Storage lives in Vault's workspace, because Vault owns the fleet's memory.
 * File format is a single JSON doc with atomic rename-write.
 */

// SERVER-ONLY module. Client code must import types + channel helpers from
// `@/lib/missionChannels` instead. Importing this file from a client
// component will trigger "node:crypto" unhandled-scheme errors at build time.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { MissionMessage, ChannelId } from '@/lib/missionChannels'
import { BOARDROOM, officeChannel } from '@/lib/missionChannels'

// Re-export for convenience from server files
export { BOARDROOM, officeChannel } from '@/lib/missionChannels'
export type { MissionMessage, ChannelId, MessageRole, MessageStatus, MessageVisibility } from '@/lib/missionChannels'

// In-memory fallback for Vercel deployment (local file paths not accessible in cloud)
const IS_VERCEL = process.env.VERCEL === '1'
let memoryStore: MissionStreamFile | null = null

function getMemoryStore(): MissionStreamFile {
  if (!memoryStore) memoryStore = { ...DEFAULT_FILE, messages: [] }
  return memoryStore
}

export const MISSION_STREAM_PATH =
  'C:\\Users\\bobel\\.openclaw\\workspace-vault\\state\\mission-stream.json'

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
  if (IS_VERCEL) return getMemoryStore()
  await ensureFile()
  const raw = await readFile(MISSION_STREAM_PATH, 'utf8')
  try {
    if (!raw.trim()) throw new Error('empty')
    const parsed = JSON.parse(raw) as MissionStreamFile
    if (!parsed.messages) parsed.messages = []
    // Migration: any legacy messages without a `channel` get put in the boardroom
    // so they're still visible in the "opt-in everything" view. Nothing breaks.
    let migrated = false
    for (const m of parsed.messages) {
      if (!m.channel) {
        m.channel = BOARDROOM
        migrated = true
      }
    }
    if (migrated) await writeStream(parsed)
    return parsed
  } catch {
    // One retry after 100ms — handles the brief window during atomic rename
    // when the file can appear empty to a concurrent reader.
    await new Promise((r) => setTimeout(r, 100))
    try {
      const retryRaw = await readFile(MISSION_STREAM_PATH, 'utf8').catch(() => '')
      if (retryRaw.trim()) {
        const retryParsed = JSON.parse(retryRaw) as MissionStreamFile
        if (!retryParsed.messages) retryParsed.messages = []
        return retryParsed
      }
    } catch { /* fall through to corrupt-file rewrite */ }
    // Corrupt file — rewrite with empty default to self-heal
    await writeStream({ ...DEFAULT_FILE })
    return { ...DEFAULT_FILE }
  }
}

async function writeStream(file: MissionStreamFile): Promise<void> {
  if (IS_VERCEL) { memoryStore = file; return }
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
  partial: Omit<MissionMessage, 'id' | 'ts' | 'channel'> & {
    id?:       string
    ts?:       number
    channel?:  ChannelId
  },
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
      visibility: partial.visibility ?? 'private',
      channel:    partial.channel ?? BOARDROOM,
      sharedFrom: partial.sharedFrom,
      toolCalls:  partial.toolCalls,
    }
    file.messages.push(msg)
    if (file.messages.length > 1000) {
      file.messages = file.messages.slice(-1000)
    }
    await writeStream(file)
    return msg
  })
}

/**
 * Promote (share) a message from its current channel to one or more target
 * channels. Creates new rows tagged with `sharedFrom` provenance. The original
 * message is not modified — you can always trace what was said where.
 */
export async function shareMessage(
  sourceId: string,
  targetChannels: ChannelId[],
  sharedBy: string = 'bo',
): Promise<MissionMessage[]> {
  return withWriteLock(async () => {
    const file = await readStream()
    const source = file.messages.find((m) => m.id === sourceId)
    if (!source) return []
    const now = Date.now()
    const created: MissionMessage[] = []
    for (const ch of targetChannels) {
      if (ch === source.channel) continue // no-op — already there
      const copy: MissionMessage = {
        id:         randomUUID(),
        ts:         now,
        agentId:    source.agentId,
        role:       source.role,
        content:    source.content,
        mentions:   source.mentions,
        replyTo:    null,
        status:     source.status,
        visibility: source.visibility,
        channel:    ch,
        sharedFrom: {
          channel:  source.channel,
          by:       sharedBy,
          at:       now,
          sourceId: source.id,
        },
      }
      file.messages.push(copy)
      created.push(copy)
    }
    if (file.messages.length > 1000) {
      file.messages = file.messages.slice(-1000)
    }
    await writeStream(file)
    return created
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
  agentId?:  string      // legacy agent filter — now maps to that agent's office
  channel?:  ChannelId   // explicit channel filter
  channels?: ChannelId[] // multiple channels (e.g. office + boardroom for an agent's total view)
  limit?:    number
  sinceTs?:  number
}): Promise<MissionMessage[]> {
  const file = await readStream()
  let msgs = file.messages
  if (params?.sinceTs !== undefined) {
    msgs = msgs.filter((m) => m.ts > params.sinceTs!)
  }
  if (params?.channel) {
    msgs = msgs.filter((m) => m.channel === params.channel)
  }
  if (params?.channels && params.channels.length > 0) {
    const set = new Set(params.channels)
    msgs = msgs.filter((m) => set.has(m.channel))
  }
  if (params?.agentId) {
    const id = params.agentId
    // Legacy filter: the agent's own turns OR anything in their office
    const office = officeChannel(id)
    msgs = msgs.filter(
      (m) =>
        m.channel === office ||
        m.agentId === id ||
        m.mentions.includes(id),
    )
  }
  if (params?.limit) {
    msgs = msgs.slice(-params.limit)
  }
  return msgs
}
