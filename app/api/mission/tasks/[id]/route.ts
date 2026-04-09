/**
 * GET /api/mission/tasks/[id] — deep task detail for Mission Control HUD.
 *
 * Returns the task, its assigned agent config, recent communal messages
 * that relate to the task, and any extracted artifacts (URLs, local file
 * paths, backtick-quoted commands) parsed out of the agent report and
 * blocked reason.
 */

import { NextResponse } from 'next/server'
import { readTasksFile, type MissionTask } from '@/lib/missionTasks'
import { getAgent, type AgentConfig } from '@/lib/agents'
import { listMessages, type MissionMessage } from '@/lib/missionStream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ArtifactKind = 'url' | 'file' | 'command'
interface ExtractedArtifact {
  kind:  ArtifactKind
  value: string
}

const URL_RE = /https?:\/\/\S+/g
// Windows-ish absolute paths beginning with C:\ or C:/
const FILE_RE = /C:[\\/][A-Za-z0-9_./\\-]+/g
const BACKTICK_RE = /`([^`\n]{1,400})`/g

function extractArtifacts(task: MissionTask): ExtractedArtifact[] {
  const haystack = `${task.agentReport ?? ''}\n${task.blockedReason ?? ''}`
  if (!haystack.trim()) return []

  const seen = new Set<string>()
  const out: ExtractedArtifact[] = []

  const push = (kind: ArtifactKind, raw: string): void => {
    const value = raw.replace(/[)\],.;:!?]+$/, '').trim()
    if (!value) return
    const key = `${kind}:${value}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind, value })
  }

  for (const m of haystack.matchAll(URL_RE)) push('url', m[0])
  for (const m of haystack.matchAll(FILE_RE)) push('file', m[0])
  for (const m of haystack.matchAll(BACKTICK_RE)) push('command', m[1])

  return out
}

function isRelated(msg: MissionMessage, task: MissionTask, agentId: string): boolean {
  if (msg.agentId === agentId) return true
  if (msg.mentions.includes(agentId)) return true
  if (msg.content.includes(task.id)) return true
  // Match a short id prefix (first 8 chars) to catch brief-<id> style refs
  const prefix = task.id.slice(0, 8)
  if (prefix && msg.content.includes(prefix)) return true
  return false
}

interface RouteContext {
  params: { id: string }
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = params

  try {
    const file = await readTasksFile()
    const task = file.tasks.find((t) => t.id === id)

    if (!task) {
      return NextResponse.json({ ok: false, error: 'task not found' }, { status: 404 })
    }

    const agent: AgentConfig | undefined = getAgent(task.assignedTo)

    const recent = await listMessages({ limit: 200 })
    const related = recent
      .filter((m) => isRelated(m, task, task.assignedTo))
      .slice(-30)

    const extractedArtifacts = extractArtifacts(task)

    return NextResponse.json({
      ok:                true,
      task,
      agent:             agent ?? null,
      relatedMessages:   related,
      extractedArtifacts,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unexpected error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
