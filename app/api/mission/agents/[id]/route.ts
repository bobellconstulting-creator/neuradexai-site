/**
 * GET /api/mission/agents/[id]
 *
 * Returns a deep profile for one agent:
 *   - config from lib/agents.ts
 *   - optional SOUL.md excerpt (if lib/personas/[id].soul.md exists)
 *   - task stats + recent tasks assigned to this agent
 *   - recent communal messages from or mentioning this agent
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getAgent } from '@/lib/agents'
import { listTasks, readTasksFile } from '@/lib/missionTasks'
import { listMessages } from '@/lib/missionStream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SoulExcerpt {
  hasFullSoul: boolean
  whoIAm:      string | null
  voice:       string | null
  tools:       string | null
  hardRules:   string | null
  raw?:        string
}

function extractSection(md: string, heading: RegExp, maxChars = 800): string | null {
  const lines = md.split('\n')
  const startIdx = lines.findIndex((l) => heading.test(l))
  if (startIdx === -1) return null
  const buf: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^##? /.test(line) || /^---$/.test(line.trim())) break
    buf.push(line)
  }
  const result = buf.join('\n').trim()
  return result.length > maxChars ? `${result.slice(0, maxChars)}…` : result
}

function loadSoulExcerpt(agentId: string): SoulExcerpt {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), 'lib', 'personas', `${agentId}.soul.md`),
      'utf8',
    )
    return {
      hasFullSoul: true,
      whoIAm:      extractSection(raw, /^##\s*WHO I AM\s*$/i),
      voice:       extractSection(raw, /^##\s*PERSONALITY\s*$/i),
      tools:       extractSection(raw, /^##\s*TOOLS I ACTUALLY HAVE\s*$/i),
      hardRules:   extractSection(raw, /^##\s*HARD RULES\s*$/i),
    }
  } catch {
    return { hasFullSoul: false, whoIAm: null, voice: null, tools: null, hardRules: null }
  }
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = ctx.params.id
  const agent = getAgent(id)
  if (!agent) {
    return NextResponse.json({ ok: false, error: 'agent not found' }, { status: 404 })
  }

  const [allTasks, tasksForAgent, messages, file] = await Promise.all([
    listTasks({ limit: 500 }),
    listTasks({ assignedTo: id, limit: 50 }),
    listMessages({ agentId: id, limit: 30 }),
    readTasksFile(),
  ])

  // Per-agent stats
  const agentTasks = file.tasks.filter((t) => t.assignedTo === id)
  const stats = {
    total:       agentTasks.length,
    open:        agentTasks.filter((t) => t.status === 'open').length,
    in_progress: agentTasks.filter((t) => t.status === 'in_progress').length,
    done:        agentTasks.filter((t) => t.status === 'done').length,
    blocked:     agentTasks.filter((t) => t.status === 'blocked').length,
    revenue:     agentTasks.filter((t) => t.revenue).length,
    lastActive:  agentTasks.length
      ? Math.max(...agentTasks.map((t) => t.updatedAt))
      : null,
    // Success rate = done / (done + blocked), if there's been any terminal activity
    successRate: (() => {
      const done = agentTasks.filter((t) => t.status === 'done').length
      const blocked = agentTasks.filter((t) => t.status === 'blocked').length
      if (done + blocked === 0) return null
      return Math.round((done / (done + blocked)) * 100)
    })(),
  }

  const soul = loadSoulExcerpt(id)

  return NextResponse.json({
    ok: true,
    agent,
    soul,
    stats,
    tasks: tasksForAgent,
    messages,
    fleetTotalTasks: allTasks.length,
  })
}
