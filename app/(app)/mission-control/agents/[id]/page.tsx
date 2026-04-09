'use client'

import { notFound, useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentConfig } from '@/lib/agents'
import type { MissionTask, TaskPriority } from '@/lib/missionTasks'
import type { MissionMessage } from '@/lib/missionStream'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { CommunalChat } from '@/components/mission-control/CommunalChat'
import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'

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

export default function AgentProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { telemetry, connected, agents } = useMissionBridge()

  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [notFoundFlag, setNotFoundFlag] = useState<boolean>(false)

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/mission/agents/${params.id}`, { cache: 'no-store' })
      if (res.status === 404) {
        setNotFoundFlag(true)
        return
      }
      if (!res.ok) throw new Error(`profile ${res.status}`)
      const data = (await res.json()) as AgentProfile
      setProfile(data)
    } catch {
      // swallow — the UI shows a loading/error state
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchProfile()
    const t = setInterval(fetchProfile, 3000)
    return () => clearInterval(t)
  }, [fetchProfile])

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

  const { agent, soul, stats, tasks, messages } = profile
  const bridgeAgent = agents.find((a) => a.id === agent.id)
  const statusDot =
    bridgeAgent?.status === 'online'  ? 'mc-dot-on'   :
    bridgeAgent?.status === 'busy'    ? 'mc-dot-busy' :
    bridgeAgent?.status === 'idle'    ? 'mc-dot-warn' :
                                        'mc-dot-off'

  return (
    <div className="mc-root">
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected || telemetry.bridgeUp} />

        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">
          {/* Identity strip */}
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => router.push('/mission-control')}
              className="mc-mono text-[11px] tracking-widest px-3 py-1 border border-[var(--mc-border)] text-sand-dim hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)] rounded"
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
            <div className="ml-auto flex items-center gap-4">
              <span className="mc-label">MODEL · {agent.model}</span>
              {agent.port && <span className="mc-label mc-label-brass">:{agent.port}</span>}
              {agent.telegram && <span className="mc-label">{agent.telegram}</span>}
              <span className={`mc-dot ${statusDot}`} />
              <span className="mc-label">{(bridgeAgent?.status ?? 'unknown').toUpperCase()}</span>
            </div>
          </div>

          {/* Main 3-col grid */}
          <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
            {/* LEFT: identity + stats + persona */}
            <section className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto mc-scroll pr-1">
              {/* Stats tiles */}
              <div className="mc-panel mc-corners p-3">
                <div className="mc-label mc-label-brass mb-2">PERFORMANCE</div>
                <div className="grid grid-cols-2 gap-2">
                  <StatTile label="TOTAL"      value={stats.total}       color="#edf3ff" />
                  <StatTile label="DONE"       value={stats.done}        color="#22c55e" />
                  <StatTile label="ACTIVE"     value={stats.in_progress} color="#00d4ff" />
                  <StatTile label="OPEN"       value={stats.open}        color="#efb356" />
                  <StatTile label="BLOCKED"    value={stats.blocked}     color="#ff6060" />
                  <StatTile label="$ REVENUE"  value={stats.revenue}     color="#22c55e" />
                </div>
                {stats.successRate !== null && (
                  <div className="mt-3 pt-2 border-t border-[var(--mc-border)] flex items-center justify-between">
                    <span className="mc-label">SUCCESS RATE</span>
                    <span className="mc-mono text-lg font-bold" style={{ color: '#22c55e' }}>
                      {stats.successRate}%
                    </span>
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-[var(--mc-border)] flex items-center justify-between">
                  <span className="mc-label">LAST ACTIVE</span>
                  <span className="mc-mono text-[10px] text-sand">
                    {ageStr(stats.lastActive)}
                  </span>
                </div>
              </div>

              {/* Persona — Who I Am */}
              {(soul.whoIAm || agent.description) && (
                <div className="mc-panel mc-corners p-3">
                  <div className="mc-label mc-label-brass mb-2">IDENTITY</div>
                  <div className="text-[11px] text-sand mc-mono leading-relaxed whitespace-pre-wrap">
                    {soul.whoIAm ?? agent.description}
                  </div>
                </div>
              )}

              {/* Voice */}
              {soul.voice && (
                <div className="mc-panel mc-corners p-3">
                  <div className="mc-label mc-label-brass mb-2">VOICE</div>
                  <div className="text-[11px] text-sand-dim mc-mono leading-relaxed whitespace-pre-wrap">
                    {soul.voice}
                  </div>
                </div>
              )}

              {/* Tools */}
              {soul.tools && (
                <div className="mc-panel mc-corners p-3">
                  <div className="mc-label mc-label-brass mb-2">TOOLS</div>
                  <div className="text-[10px] text-sand-dim mc-mono leading-relaxed whitespace-pre-wrap">
                    {soul.tools}
                  </div>
                </div>
              )}

              {/* Hard Rules */}
              {soul.hardRules && (
                <div className="mc-panel mc-corners p-3">
                  <div className="mc-label mc-label-brass mb-2">HARD RULES</div>
                  <div className="text-[10px] text-sand-dim mc-mono leading-relaxed whitespace-pre-wrap">
                    {soul.hardRules}
                  </div>
                </div>
              )}
            </section>

            {/* CENTER: direct chat */}
            <section className="col-span-6 flex flex-col min-h-0">
              <CommunalChat
                agentId={agent.id}
                title={`DIRECT CHANNEL · ${agent.label}`}
                placeholder={`Message ${agent.displayName} directly. Use @mentions to loop others.`}
              />
            </section>

            {/* RIGHT: task board for this agent + quick drop */}
            <section className="col-span-3 flex flex-col gap-3 min-h-0">
              <AgentTaskPanel agent={agent} tasks={tasks} onRefresh={fetchProfile} />
            </section>
          </div>
        </div>

        <BottomBar telemetry={telemetry} />
      </div>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded py-2 border"
      style={{
        borderColor: `${color}30`,
        background: `${color}08`,
      }}
    >
      <span className="mc-mono text-xl font-bold" style={{ color }}>
        {value.toString().padStart(2, '0')}
      </span>
      <span className="mc-label text-[9px]">{label}</span>
    </div>
  )
}

function AgentTaskPanel({
  agent,
  tasks,
  onRefresh,
}: {
  agent: AgentConfig
  tasks: MissionTask[]
  onRefresh: () => void
}) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('high')
  const [revenue, setRevenue] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState(false)

  const grouped = useMemo(
    () => ({
      active:   tasks.filter((t) => t.status === 'in_progress' || t.status === 'open'),
      blocked:  tasks.filter((t) => t.status === 'blocked'),
      done:     tasks.filter((t) => t.status === 'done').slice(0, 10),
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleDrop()
          }}
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
            style={{
              borderColor: agent.color,
              color: agent.color,
            }}
          >
            {submitting ? '…' : 'DROP'}
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-2 space-y-3">
        <TaskSection label="ACTIVE"   items={grouped.active}  emptyMsg="NO ACTIVE TASKS" />
        <TaskSection label="BLOCKED"  items={grouped.blocked} emptyMsg={null} />
        <TaskSection label="DONE · 10" items={grouped.done}   emptyMsg={null} />
      </div>
    </div>
  )
}

function TaskSection({
  label,
  items,
  emptyMsg,
}: {
  label: string
  items: MissionTask[]
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
        background: task.revenue ? 'rgba(34,197,94,0.04)' : 'rgba(0,212,255,0.02)',
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
              style={{ color: STATUS_COLOR[task.status], borderColor: STATUS_COLOR[task.status] }}
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
