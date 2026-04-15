'use client'

import { notFound, useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentConfig } from '@/lib/agents'
import type { MissionTask, TaskPriority } from '@/lib/missionTasks'
import type { MissionMessage } from '@/lib/missionStream'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'
import { VoiceChat } from '@/components/mission-control/VoiceChat'

// ── Types ─────────────────────────────────────────────────────────────────

interface AgentProfile {
  ok:    boolean
  agent: AgentConfig
  soul: {
    hasFullSoul: boolean
    whoIAm:      string | null
    voice:       string | null
    tools:       string | null
    hardRules:   string | null
  }
  stats: {
    total:       number
    open:        number
    in_progress: number
    done:        number
    blocked:     number
    revenue:     number
    lastActive:  number | null
    successRate: number | null
  }
  tasks:    MissionTask[]
  messages: MissionMessage[]
}

const STATUS_COLOR: Record<MissionTask['status'], string> = {
  open:        '#efb356',
  in_progress: '#00d4ff',
  done:        '#22c55e',
  blocked:     '#ff6060',
}

function ageStr(ts: number | null): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AgentProfilePage() {
  const params  = useParams<{ id: string }>()
  const router  = useRouter()
  const { connected, agents } = useMissionBridge()

  // Agent profile (tasks, soul, stats)
  const [profile, setProfile]           = useState<AgentProfile | null>(null)
  const [loading, setLoading]           = useState<boolean>(true)
  const [notFoundFlag, setNotFoundFlag] = useState<boolean>(false)

  // ── Fetch profile ──────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/mission/agents/${params.id}`, { cache: 'no-store' })
      if (res.status === 404) { setNotFoundFlag(true); return }
      if (!res.ok) throw new Error(`profile ${res.status}`)
      const data = (await res.json()) as AgentProfile
      setProfile(data)
    } catch {
      // UI shows loading/error state
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchProfile()
    const t = setInterval(fetchProfile, 3000)
    return () => clearInterval(t)
  }, [fetchProfile])

  // ── Guards ─────────────────────────────────────────────────────────────

  if (notFoundFlag) notFound()

  if (loading || !profile) {
    return (
      <div className="mc-root">
        <div className="mc-grid-bg" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="mc-label text-[var(--mc-text-mute)]">LOADING AGENT PROFILE…</span>
        </div>
      </div>
    )
  }

  const { agent, tasks } = profile
  const bridgeAgent  = agents.find((a) => a.id === agent.id)
  const statusDot    =
    bridgeAgent?.status === 'online' ? 'mc-dot-on'   :
    bridgeAgent?.status === 'busy'   ? 'mc-dot-busy' :
    bridgeAgent?.status === 'idle'   ? 'mc-dot-warn' :
                                       'mc-dot-off'

  return (
    <div className="mc-root">
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected} />

        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">

          {/* Identity strip */}
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-4 flex-shrink-0 flex-wrap gap-y-2">
            <button
              onClick={() => router.push('/mission-control')}
              className="mc-mono text-[11px] tracking-widest px-3 py-1 min-h-[44px] border border-[var(--mc-border)] text-sand-dim hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)] rounded"
            >
              ← FLEET
            </button>
            <span className="text-3xl" style={{ color: agent.color }}>
              {agent.icon}
            </span>
            <div className="flex flex-col">
              <span
                className="mc-mono text-lg tracking-[0.22em] font-semibold"
                style={{ color: agent.color }}
              >
                {agent.label}
              </span>
              <span className="mc-label">{agent.title}</span>
            </div>
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              <span className="mc-label hidden sm:inline">MODEL · {agent.model}</span>
              {agent.port && <span className="mc-label mc-label-brass hidden sm:inline">:{agent.port}</span>}
              <span className={`mc-dot ${statusDot}`} />
            </div>
          </div>

          {/* Main content — chat left, tasks right */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-3">
            <section className="col-span-1 md:col-span-9 mc-panel mc-corners flex flex-col min-h-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)]">
                <span className="mc-label mc-label-brass">{agent.label} · DIRECT LINE</span>
                <span className="mc-label text-[var(--mc-cyan)]">VOICE ENABLED</span>
              </div>
              <VoiceChat
                agentId={agent.id}
                agentColor={agent.color}
                agentLabel={agent.label}
                channel={`office:${agent.id}`}
              />
            </section>
            <section className="col-span-1 md:col-span-3 flex flex-col gap-3 min-h-0">
              <AgentTaskPanel agent={agent} tasks={tasks} onRefresh={fetchProfile} />
            </section>
          </div>
        </div>

        <BottomBar />
      </div>
    </div>
  )
}

// ── AgentTaskPanel ─────────────────────────────────────────────────────────

function AgentTaskPanel({
  agent,
  tasks,
  onRefresh,
}: {
  agent:     AgentConfig
  tasks:     MissionTask[]
  onRefresh: () => void
}) {
  const [title,      setTitle]      = useState('')
  const [priority,   setPriority]   = useState<TaskPriority>('high')
  const [revenue,    setRevenue]    = useState<boolean>(true)
  const [submitting, setSubmitting] = useState(false)

  const grouped = useMemo(
    () => ({
      active:  tasks.filter((t) => t.status === 'in_progress' || t.status === 'open'),
      blocked: tasks.filter((t) => t.status === 'blocked'),
      done:    tasks.filter((t) => t.status === 'done').slice(0, 10),
    }),
    [tasks],
  )

  const handleDrop = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/mission/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:      title.trim(),
          assignedTo: agent.id,
          priority,
          revenue,
        }),
      })
      setTitle('')
      onRefresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mc-panel mc-corners h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)]">
        <span className="mc-label mc-label-brass">{agent.label} TASKS</span>
        <span className="mc-label">{tasks.length.toString().padStart(3, '0')}</span>
      </div>

      {/* Quick drop */}
      <div className="px-3 py-2 border-b border-[var(--mc-border)] space-y-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleDrop() }}
          placeholder={`Drop a task for ${agent.displayName}…`}
          className="w-full bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[11px] text-sand placeholder:text-[var(--mc-text-mute)] focus:outline-none focus:border-[var(--mc-cyan)]"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-1.5 py-1 mc-mono text-[9px] text-sand focus:outline-none"
          >
            <option value="critical">CRIT</option>
            <option value="high">HIGH</option>
            <option value="medium">MED</option>
            <option value="low">LOW</option>
          </select>
          <label className="flex items-center gap-1 mc-mono text-[9px] text-[#22c55e] cursor-pointer">
            <input
              type="checkbox"
              checked={revenue}
              onChange={(e) => setRevenue(e.target.checked)}
              className="accent-[#22c55e]"
            />
            $REV
          </label>
          <button
            onClick={handleDrop}
            disabled={submitting || !title.trim()}
            className="ml-auto mc-mono text-[10px] tracking-widest px-2.5 py-1 border rounded disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: agent.color, color: agent.color }}
          >
            {submitting ? '…' : 'DROP'}
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-2 space-y-3">
        <TaskSection label="ACTIVE"    items={grouped.active}  emptyMsg="NO ACTIVE TASKS" />
        <TaskSection label="BLOCKED"   items={grouped.blocked} emptyMsg={null} />
        <TaskSection label="DONE · 10" items={grouped.done}    emptyMsg={null} />
      </div>
    </div>
  )
}

// ── Task sub-components ────────────────────────────────────────────────────

function TaskSection({
  label,
  items,
  emptyMsg,
}: {
  label:    string
  items:    MissionTask[]
  emptyMsg: string | null
}) {
  if (items.length === 0 && !emptyMsg) return null
  return (
    <div>
      <div className="mc-label mb-1">{label}</div>
      {items.length === 0 ? (
        <div className="mc-label text-[var(--mc-text-mute)] text-center py-2">{emptyMsg}</div>
      ) : (
        <div className="space-y-1">
          {items.map((t) => (
            <AgentTaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentTaskRow({ task }: { task: MissionTask }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onClick={() => setOpen((v) => !v)}
      className="px-2 py-1.5 rounded border cursor-pointer"
      style={{
        borderColor: task.revenue ? 'rgba(34,197,94,0.30)' : 'rgba(0,212,255,0.12)',
        background:  task.revenue ? 'rgba(34,197,94,0.04)'  : 'rgba(0,212,255,0.02)',
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mc-mono text-sm pt-0.5 shrink-0"
          style={{ color: STATUS_COLOR[task.status] }}
        >
          ●
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-sand mc-mono truncate">{task.title}</div>
          {task.revenue && (
            <div className="mc-mono text-[9px] text-[#22c55e] mt-0.5">$ REVENUE</div>
          )}
          {open && task.agentReport && (
            <div
              className="mt-2 text-[10px] mc-mono whitespace-pre-wrap border-l-2 pl-2"
              style={{
                color:       STATUS_COLOR[task.status],
                borderColor: STATUS_COLOR[task.status],
              }}
            >
              {task.agentReport}
            </div>
          )}
          {open && task.blockedReason && !task.agentReport && (
            <div className="mt-1 text-[10px] mc-mono text-[#ff6060]">
              → {task.blockedReason}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
