'use client'

/**
 * useAgentGraph — assembles a single GraphData blob for one agent's room by
 * stitching together:
 *   - Persona sections       (/api/mission/persona/:id)      → identity + memory nodes
 *   - MissionTasks           (useMissionTasks, client-filter) → task nodes
 *   - MissionIdeas           (useMissionIdeas)               → idea nodes
 *   - Recent office chat     (useMissionStream)              → chat cluster nodes
 *   - UploadRecords          (useMissionUploads)             → document nodes
 *
 * Edge derivation:
 *   - idea.linkedTaskId → task            (spawned-from)
 *   - chat message mentions a filename   (references)
 *   - memory section body contains a task title keyword (references)
 *
 * Total nodes capped at 120 in deterministic priority order.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useMissionTasks } from '@/lib/useMissionTasks'
import { useMissionIdeas } from '@/lib/useMissionIdeas'
import { useMissionUploads } from '@/lib/useMissionUploads'
import { useMissionStream } from '@/lib/useMissionStream'
import { officeChannel } from '@/lib/missionChannels'
import type { MissionTask } from '@/lib/missionTasks'
import type { MissionIdea } from '@/types/mission-idea'
import type { UploadRecord } from '@/lib/useMissionUploads'
import type { MissionMessage } from '@/lib/missionChannels'
import type { GraphData, GraphEdge, GraphNode, NodeKind } from '@/types/agent-graph'

// ── Color + size constants ──────────────────────────────────────────────────

const COLOR_IDENTITY = '#ff6fe0'
const COLOR_MEMORY   = '#00d4ff'
const COLOR_IDEA     = '#efb356'
const COLOR_TASK_ACTIVE  = '#22c55e'
const COLOR_TASK_BLOCKED = '#ff6060'
const COLOR_TASK_DONE    = '#5a6c87'
const COLOR_CHAT     = '#b388ff'
const COLOR_DOCUMENT = '#edf3ff'

const SIZE_IDENTITY     = 1.4
const SIZE_TASK_ACTIVE  = 1.2
const SIZE_TASK_BLOCKED = 1.2
const SIZE_TASK_DONE    = 0.7
const SIZE_IDEA         = 1.0
const SIZE_MEMORY       = 0.9
const SIZE_CHAT         = 1.0
const SIZE_DOCUMENT     = 0.8

const MAX_NODES            = 120
const CHAT_DAY_CAP         = 5
const DOCUMENT_CAP         = 10
const RECENT_WINDOW_MS     = 1000 * 60 * 60 * 24 * 30   // 30 days — used for recency weight
const EDGE_WEIGHT_FLOOR    = 0.3
const EDGE_WEIGHT_CEILING  = 0.9

// ── Persona API response shape ──────────────────────────────────────────────

type PersonaKind = 'soul' | 'identity' | 'memory' | 'tools' | 'user' | 'heartbeat'

interface PersonaSection {
  kind:    PersonaKind
  heading: string
  body:    string
  tags:    string[]
}

interface ParsedPersona {
  agentId:  string
  sections: PersonaSection[]
}

interface PersonaResponse {
  success: boolean
  persona?: ParsedPersona
  error?:  string
}

// ── Hook return ─────────────────────────────────────────────────────────────

export interface UseAgentGraphReturn {
  graph:   GraphData
  loading: boolean
  error:   string | null
  reload:  () => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function recencyWeight(ts: number | undefined): number {
  if (!ts) return EDGE_WEIGHT_FLOOR
  const age = Date.now() - ts
  if (age <= 0) return EDGE_WEIGHT_CEILING
  const normalized = Math.max(0, 1 - age / RECENT_WINDOW_MS)
  const spread = EDGE_WEIGHT_CEILING - EDGE_WEIGHT_FLOOR
  return EDGE_WEIGHT_FLOOR + normalized * spread
}

function taskColor(task: MissionTask): string {
  if (task.status === 'blocked') return COLOR_TASK_BLOCKED
  if (task.status === 'done') return COLOR_TASK_DONE
  return COLOR_TASK_ACTIVE
}

function taskSize(task: MissionTask): number {
  if (task.status === 'blocked') return SIZE_TASK_BLOCKED
  if (task.status === 'done') return SIZE_TASK_DONE
  return SIZE_TASK_ACTIVE
}

function taskStatusForGraph(task: MissionTask): GraphNode['status'] {
  if (task.status === 'blocked') return 'blocked'
  if (task.status === 'done') return 'done'
  return 'active'
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clampText(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

/**
 * Simple keyword extraction from a task title — lowercased tokens >= 4 chars.
 * Used to match memory sections to tasks.
 */
function taskKeywords(task: MissionTask): string[] {
  return task.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 4)
}

// ── Main hook ───────────────────────────────────────────────────────────────

export function useAgentGraph(agentId: string): UseAgentGraphReturn {
  const { tasks, loading: tasksLoading, error: tasksError } = useMissionTasks(3000)
  const { ideas, loading: ideasLoading, error: ideasError } = useMissionIdeas({ agentId })
  const { uploads, loading: uploadsLoading, error: uploadsError } = useMissionUploads()
  const { messages, loading: streamLoading, error: streamError } = useMissionStream({
    channel: officeChannel(agentId),
    pollMs:  4000,
  })

  const [persona, setPersona] = useState<ParsedPersona | null>(null)
  const [personaLoading, setPersonaLoading] = useState<boolean>(true)
  const [personaError, setPersonaError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState<number>(0)

  // Fetch persona whenever agentId or reloadTick changes.
  useEffect(() => {
    let cancelled = false
    if (!agentId) {
      setPersona(null)
      setPersonaLoading(false)
      return () => { cancelled = true }
    }
    setPersonaLoading(true)
    fetch(`/api/mission/persona/${encodeURIComponent(agentId)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`persona ${res.status}`)
        const data = (await res.json()) as PersonaResponse
        if (cancelled) return
        if (!data.success || !data.persona) {
          throw new Error(data.error ?? 'persona parse failed')
        }
        setPersona(data.persona)
        setPersonaError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPersonaError(err instanceof Error ? err.message : 'persona error')
        setPersona(null)
      })
      .finally(() => {
        if (!cancelled) setPersonaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId, reloadTick])

  const reload = useCallback(() => {
    setReloadTick((n) => n + 1)
  }, [])

  // Client-side filter: useMissionTasks pulls the global list.
  const agentTasks = useMemo<MissionTask[]>(() => {
    return tasks.filter((t) => t.assignedTo === agentId)
  }, [tasks, agentId])

  // ── Build nodes + edges ─────────────────────────────────────────────────
  const graph = useMemo<GraphData>(() => {
    const identityNodes: GraphNode[] = []
    const memoryNodes:   GraphNode[] = []
    const ideaNodes:     GraphNode[] = []
    const taskActiveNodes:  GraphNode[] = []
    const taskBlockedNodes: GraphNode[] = []
    const taskDoneNodes:    GraphNode[] = []
    const chatNodes:     GraphNode[] = []
    const documentNodes: GraphNode[] = []

    // Identity + memory nodes from persona sections
    if (persona) {
      persona.sections.forEach((section, idx) => {
        const isIdentity = section.kind === 'identity' || section.kind === 'soul'
        const isMemory   = section.kind === 'memory' || section.kind === 'user' || section.kind === 'heartbeat'
        if (isIdentity) {
          identityNodes.push({
            id:     `identity:${agentId}:${idx}`,
            kind:   'identity',
            title:  section.heading || 'Core',
            body:   clampText(section.body, 600),
            color:  COLOR_IDENTITY,
            size:   SIZE_IDENTITY,
            sourceRef: { kind: 'identity', refId: `${section.kind}:${idx}` },
            status: null,
          })
        } else if (isMemory) {
          memoryNodes.push({
            id:     `memory:${agentId}:${idx}`,
            kind:   'memory',
            title:  section.heading || 'Memory',
            body:   clampText(section.body, 600),
            color:  COLOR_MEMORY,
            size:   SIZE_MEMORY,
            sourceRef: { kind: 'memory', refId: `${section.kind}:${idx}` },
            status: null,
          })
        }
      })
    }

    // Idea nodes
    ideas.forEach((idea: MissionIdea) => {
      const statusGraph: GraphNode['status'] =
        idea.status === 'fresh'     ? 'fresh'     :
        idea.status === 'claimed'   ? 'claimed'   :
        idea.status === 'dismissed' ? 'dismissed' : null
      ideaNodes.push({
        id:        `idea:${idea.id}`,
        kind:      'idea',
        title:     idea.title,
        body:      clampText(idea.body, 600),
        color:     COLOR_IDEA,
        size:      SIZE_IDEA,
        sourceRef: { kind: 'idea', refId: idea.id },
        status:    statusGraph,
        createdAt: idea.createdAt,
      })
    })

    // Task nodes — split by status bucket so we can prioritize later.
    agentTasks.forEach((task) => {
      const node: GraphNode = {
        id:        `task:${task.id}`,
        kind:      'task',
        title:     task.title,
        body:      clampText(task.description || task.agentReport || task.blockedReason || '', 600),
        color:     taskColor(task),
        size:      taskSize(task),
        sourceRef: { kind: 'task', refId: task.id },
        status:    taskStatusForGraph(task),
        createdAt: task.createdAt,
      }
      if (task.status === 'blocked') taskBlockedNodes.push(node)
      else if (task.status === 'done') taskDoneNodes.push(node)
      else taskActiveNodes.push(node)
    })

    // Chat nodes — cluster messages by calendar day, cap at CHAT_DAY_CAP most recent.
    const messagesByDay = new Map<string, MissionMessage[]>()
    for (const msg of messages) {
      const key = dayKey(msg.ts)
      const bucket = messagesByDay.get(key)
      if (bucket) {
        bucket.push(msg)
      } else {
        messagesByDay.set(key, [msg])
      }
    }
    const sortedDays = Array.from(messagesByDay.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, CHAT_DAY_CAP)
    for (const [day, bucket] of sortedDays) {
      const latest = bucket[bucket.length - 1]
      const preview = clampText(
        bucket.map((m) => m.content.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · '),
        400,
      )
      chatNodes.push({
        id:        `chat:${agentId}:${day}`,
        kind:      'chat',
        title:     `${day} · ${bucket.length} msgs`,
        body:      preview || '(no text)',
        color:     COLOR_CHAT,
        size:      SIZE_CHAT,
        sourceRef: { kind: 'chat', refId: `${officeChannel(agentId)}#${day}` },
        status:    null,
        createdAt: latest ? latest.ts : undefined,
      })
    }

    // Document nodes — top N most recent uploads.
    const recentUploads: UploadRecord[] = [...uploads]
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .slice(0, DOCUMENT_CAP)
    recentUploads.forEach((upload) => {
      documentNodes.push({
        id:        `document:${upload.id}`,
        kind:      'document',
        title:     upload.originalName || upload.name,
        body:      `${upload.kind.toUpperCase()} · ${(upload.size / 1024).toFixed(1)} KB`,
        color:     COLOR_DOCUMENT,
        size:      SIZE_DOCUMENT,
        sourceRef: { kind: 'document', refId: upload.id },
        status:    null,
        createdAt: upload.uploadedAt,
      })
    })

    // Deterministic priority order as per spec:
    // identity → tasks active → ideas fresh → memory → chat → tasks done → documents → tasks blocked
    const freshIdeas = ideaNodes.filter((n) => n.status === 'fresh')
    const otherIdeas = ideaNodes.filter((n) => n.status !== 'fresh')
    const ordered: GraphNode[] = [
      ...identityNodes,
      ...taskActiveNodes,
      ...freshIdeas,
      ...memoryNodes,
      ...chatNodes,
      ...taskDoneNodes,
      ...documentNodes,
      ...taskBlockedNodes,
      ...otherIdeas,
    ]
    const cappedNodes = ordered.slice(0, MAX_NODES)
    const keptIds = new Set<string>(cappedNodes.map((n) => n.id))

    // ── Edges ─────────────────────────────────────────────────────────────
    const edges: GraphEdge[] = []

    // 1. idea.linkedTaskId → task (spawned-from : task source, idea target)
    //    Spec wording: "task ← idea" (task spawned from idea).
    for (const idea of ideas) {
      if (!idea.linkedTaskId) continue
      const ideaId = `idea:${idea.id}`
      const taskId = `task:${idea.linkedTaskId}`
      if (!keptIds.has(ideaId) || !keptIds.has(taskId)) continue
      edges.push({
        id:     `${taskId}<<${ideaId}`,
        source: ideaId,
        target: taskId,
        kind:   'spawned-from',
        weight: recencyWeight(idea.updatedAt || idea.createdAt),
      })
    }

    // 2. Chat messages mentioning an upload filename → references edge (chat cluster → document)
    //    Keyed by day cluster, so we dedupe per (day, documentId).
    const documentByName = new Map<string, string>() // normalized name → node id
    for (const d of documentNodes) {
      if (!keptIds.has(d.id)) continue
      const lower = d.title.toLowerCase()
      if (lower.length >= 4) documentByName.set(lower, d.id)
    }
    const seenChatDocEdges = new Set<string>()
    for (const msg of messages) {
      const chatNodeId = `chat:${agentId}:${dayKey(msg.ts)}`
      if (!keptIds.has(chatNodeId)) continue
      const haystack = msg.content.toLowerCase()
      for (const [name, docNodeId] of documentByName) {
        if (!haystack.includes(name)) continue
        const edgeKey = `${chatNodeId}>>${docNodeId}`
        if (seenChatDocEdges.has(edgeKey)) continue
        seenChatDocEdges.add(edgeKey)
        edges.push({
          id:     edgeKey,
          source: chatNodeId,
          target: docNodeId,
          kind:   'references',
          weight: recencyWeight(msg.ts),
        })
      }
    }

    // 3. Memory section referencing task title keyword → references edge
    const activeAndBlockedTaskKeywords: Array<{ nodeId: string; keywords: string[]; createdAt: number }> = []
    for (const t of agentTasks) {
      if (t.status === 'done') continue
      const id = `task:${t.id}`
      if (!keptIds.has(id)) continue
      activeAndBlockedTaskKeywords.push({ nodeId: id, keywords: taskKeywords(t), createdAt: t.createdAt })
    }
    for (const memNode of memoryNodes) {
      if (!keptIds.has(memNode.id)) continue
      const body = (memNode.body ?? '').toLowerCase()
      if (!body) continue
      for (const entry of activeAndBlockedTaskKeywords) {
        const hit = entry.keywords.some((kw) => body.includes(kw))
        if (!hit) continue
        const edgeId = `${memNode.id}>>${entry.nodeId}`
        edges.push({
          id:     edgeId,
          source: memNode.id,
          target: entry.nodeId,
          kind:   'references',
          weight: recencyWeight(entry.createdAt),
        })
      }
    }

    return {
      agentId,
      nodes: cappedNodes,
      edges,
    }
  }, [persona, ideas, agentTasks, messages, uploads, agentId])

  const loading = personaLoading || tasksLoading || ideasLoading || uploadsLoading || streamLoading
  const error = personaError ?? tasksError ?? ideasError ?? uploadsError ?? streamError ?? null

  return { graph, loading, error, reload }
}
