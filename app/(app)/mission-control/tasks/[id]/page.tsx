'use client'

/**
 * Mission Control — Task Deep-Dive
 *
 * Full detail view for one MissionTask. Polls /api/mission/tasks/[id] every
 * 3s so Bo can watch live agent output drop in. Reuses the existing
 * war-room aesthetic (mc-* classes + Tailwind).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'
import { useMissionBridge } from '@/lib/useMissionBridge'

import type { MissionTask } from '@/lib/missionTasks'
import type { AgentConfig } from '@/lib/agents'
import type { MissionMessage } from '@/lib/missionStream'

// ── Types ────────────────────────────────────────────────────────────────────

type ArtifactKind = 'url' | 'file' | 'command'
interface ExtractedArtifact {
  kind:  ArtifactKind
  value: string
}

interface TaskDetailPayload {
  ok:                 boolean
  task:               MissionTask
  agent:              AgentConfig | null
  relatedMessages:    MissionMessage[]
  extractedArtifacts: ExtractedArtifact[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusDotClass(status: MissionTask['status']): string {
  switch (status) {
    case 'in_progress': return 'mc-dot mc-dot-busy'
    case 'done':        return 'mc-dot mc-dot-on'
    case 'blocked':     return 'mc-dot mc-dot-warn'
    case 'open':
    default:            return 'mc-dot mc-dot-off'
  }
}

function priorityColor(p: MissionTask['priority']): string {
  switch (p) {
    case 'critical': return 'text-[#ff4a6b] border-[#ff4a6b]/50'
    case 'high':     return 'text-[var(--mc-brass)] border-[var(--mc-brass)]/50'
    case 'medium':   return 'text-[var(--mc-cyan)] border-[var(--mc-cyan)]/40'
    case 'low':
    default:         return 'text-sand-dim border-[var(--mc-border)]'
  }
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString([], { hour12: false })
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TaskDeepDivePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id ?? ''

  const { telemetry, connected } = useMissionBridge()
  const bridgeUp = connected || telemetry.bridgeUp

  const [data, setData]     = useState<TaskDetailPayload | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [notFound, setNF]   = useState<boolean>(false)
  const [busy, setBusy]     = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)

  const load = useCallback(async (): Promise<void> => {
    if (!id) return
    try {
      const res = await fetch(`/api/mission/tasks/${id}`, { cache: 'no-store' })
      if (res.status === 404) {
        setNF(true)
        return
      }
      const json = (await res.json()) as TaskDetailPayload
      if (json.ok) {
        setData(json)
        setError(null)
      } else {
        setError('failed to load task')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'network error')
    }
  }, [id])

  useEffect(() => {
    void load()
    const t = setInterval(() => { void load() }, 3000)
    return () => clearInterval(t)
  }, [load])

  const patchStatus = useCallback(
    async (status: MissionTask['status']): Promise<void> => {
      if (!id) return
      setBusy(true)
      try {
        await fetch(`/api/mission/tasks?id=${encodeURIComponent(id)}`, {
          method:  'PATCH',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ status }),
        })
        await load()
      } catch {
        // swallowed; next poll will resync
      } finally {
        setBusy(false)
      }
    },
    [id, load],
  )

  const copyReport = useCallback(async (): Promise<void> => {
    const report = data?.task.agentReport ?? ''
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [data])

  const task = data?.task
  const agent = data?.agent ?? null
  const artifacts = data?.extractedArtifacts ?? []
  const messages  = data?.relatedMessages ?? []

  const agentStyle = useMemo(() => {
    if (!agent) return {}
    return {
      color:       agent.color,
      borderColor: agent.accent,
      background:  agent.bgColor,
    }
  }, [agent])

  return (
    <div className="mc-root min-h-screen flex flex-col">
      <TopBar bridgeUp={bridgeUp} />

      {/* Header strip */}
      <div className="relative z-10 px-6 py-3 border-b border-[var(--mc-border)] bg-[rgba(5,7,20,0.55)] flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push('/mission-control')}
          className="mc-label flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--mc-border)] hover:border-[var(--mc-cyan)] hover:text-[var(--mc-cyan)] transition-colors"
        >
          <span>&larr;</span>
          <span>TASKS</span>
        </button>

        {task ? (
          <>
            <span className={statusDotClass(task.status)} />
            <span className="mc-label mc-label-brass uppercase">{task.status.replace('_', ' ')}</span>

            <span className={`mc-label px-2 py-0.5 rounded border ${priorityColor(task.priority)}`}>
              {task.priority}
            </span>

            {task.revenue ? (
              <span className="mc-label px-2 py-0.5 rounded border border-[var(--mc-brass)]/60 text-[var(--mc-brass)]">
                REVENUE
              </span>
            ) : null}

            {agent ? (
              <Link
                href={`/mission-control/agents/${agent.id}`}
                className="flex items-center gap-2 px-2.5 py-1 rounded border mc-mono text-xs transition-colors hover:brightness-125"
                style={agentStyle}
              >
                <span className="text-base leading-none">{agent.icon}</span>
                <span className="mc-label" style={{ color: agent.color }}>{agent.label}</span>
              </Link>
            ) : (
              <span className="mc-label text-sand-dim">UNASSIGNED</span>
            )}

            <div className="flex-1" />

            {/* Action buttons */}
            {task.status === 'blocked' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void patchStatus('open')}
                className="mc-label px-3 py-1 rounded border border-[var(--mc-cyan)]/60 text-[var(--mc-cyan)] hover:bg-[rgba(0,212,255,0.08)] disabled:opacity-40"
              >
                RETRY
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || task.status === 'done'}
              onClick={() => void patchStatus('done')}
              className="mc-label px-3 py-1 rounded border border-[var(--mc-brass)]/60 text-[var(--mc-brass)] hover:bg-[rgba(212,175,55,0.08)] disabled:opacity-40"
            >
              MARK DONE
            </button>
            <button
              type="button"
              onClick={() => void copyReport()}
              disabled={!task.agentReport}
              className="mc-label px-3 py-1 rounded border border-[var(--mc-border)] text-sand hover:border-[var(--mc-cyan)] hover:text-[var(--mc-cyan)] disabled:opacity-40"
            >
              {copied ? 'COPIED' : 'COPY REPORT'}
            </button>
            {/* DELETE is a placeholder until a real delete endpoint exists */}
            <button
              type="button"
              disabled
              title="delete endpoint not yet implemented"
              className="mc-label px-3 py-1 rounded border border-[var(--mc-border)] text-sand-dim opacity-40 cursor-not-allowed"
            >
              DELETE
            </button>
          </>
        ) : (
          <span className="mc-label text-sand-dim">
            {notFound ? 'TASK NOT FOUND' : error ? `ERROR: ${error}` : 'LOADING…'}
          </span>
        )}
      </div>

      {/* Main grid */}
      <main className="relative z-10 flex-1 px-6 py-5 grid grid-cols-12 gap-5 overflow-hidden">
        {/* LEFT: metadata + agent card */}
        <section className="col-span-4 flex flex-col gap-5 min-h-0">
          <div className="mc-panel mc-corners p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="mc-label mc-label-brass">TASK</span>
              <span className="mc-mono text-[10px] text-sand-dim">{id.slice(0, 8)}</span>
            </div>
            {task ? (
              <>
                <h1 className="text-sand text-lg leading-tight mc-mono">{task.title}</h1>
                <p className="text-sand-dim text-sm leading-relaxed whitespace-pre-wrap">
                  {task.description || '—'}
                </p>
                <div className="border-t border-[var(--mc-border)] pt-3 grid grid-cols-2 gap-y-2 text-xs mc-mono">
                  <span className="text-sand-dim">CREATED</span>
                  <span className="text-sand text-right">{formatTime(task.createdAt)}</span>
                  <span className="text-sand-dim">UPDATED</span>
                  <span className="text-sand text-right">{formatTime(task.updatedAt)}</span>
                  <span className="text-sand-dim">PRIORITY</span>
                  <span className="text-sand text-right uppercase">{task.priority}</span>
                  <span className="text-sand-dim">REVENUE</span>
                  <span className="text-sand text-right">{task.revenue ? 'YES' : 'NO'}</span>
                  <span className="text-sand-dim">CREATED BY</span>
                  <span className="text-sand text-right">{task.createdBy}</span>
                </div>
              </>
            ) : (
              <div className="text-sand-dim text-sm mc-mono">…</div>
            )}
          </div>

          {agent ? (
            <Link
              href={`/mission-control/agents/${agent.id}`}
              className="mc-panel mc-corners p-4 flex flex-col gap-2 transition-colors hover:brightness-110"
              style={{ borderColor: agent.accent }}
            >
              <div className="flex items-center justify-between">
                <span className="mc-label mc-label-brass">ASSIGNED AGENT</span>
                <span className="mc-mono text-[10px] text-sand-dim">{agent.provider.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded border flex items-center justify-center text-xl"
                  style={{ borderColor: agent.accent, color: agent.color, background: agent.bgColor }}
                >
                  {agent.icon}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="mc-mono text-sm" style={{ color: agent.color }}>{agent.label}</span>
                  <span className="text-sand-dim text-xs">{agent.role}</span>
                </div>
              </div>
              <div className="text-xs mc-mono text-sand-dim border-t border-[var(--mc-border)] pt-2">
                {agent.model}
              </div>
            </Link>
          ) : null}
        </section>

        {/* CENTER: report + blocked reason */}
        <section className="col-span-5 flex flex-col gap-5 min-h-0">
          <div className="mc-panel mc-corners p-4 flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="mc-label mc-label-brass">AGENT REPORT</span>
              {task?.status === 'in_progress' ? (
                <span className="flex items-center gap-2">
                  <span className="mc-dot mc-dot-busy" />
                  <span className="mc-label text-[var(--mc-cyan)] mc-slow-pulse">
                    AGENT WORKING…
                  </span>
                </span>
              ) : null}
            </div>
            <div className="mc-scroll flex-1 overflow-auto">
              <pre className="mc-mono text-xs text-sand whitespace-pre-wrap leading-relaxed">
                {task?.agentReport?.trim() || (task?.status === 'in_progress' ? '…' : 'no report yet')}
              </pre>
            </div>
          </div>

          {task?.blockedReason ? (
            <div className="mc-panel mc-corners p-4 border-[#ff4a6b]/40">
              <div className="flex items-center gap-2 mb-2">
                <span className="mc-dot mc-dot-warn" />
                <span className="mc-label" style={{ color: '#ff4a6b' }}>BLOCKED REASON</span>
              </div>
              <pre className="mc-mono text-xs text-sand whitespace-pre-wrap leading-relaxed">
                {task.blockedReason}
              </pre>
            </div>
          ) : null}
        </section>

        {/* RIGHT: artifacts + related messages */}
        <section className="col-span-3 flex flex-col gap-5 min-h-0">
          <div className="mc-panel mc-corners p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="mc-label mc-label-brass">ARTIFACTS</span>
              <span className="mc-mono text-[10px] text-sand-dim">{artifacts.length}</span>
            </div>
            <div className="mc-scroll flex flex-col gap-2 max-h-[240px] overflow-auto">
              {artifacts.length === 0 ? (
                <div className="text-sand-dim text-xs mc-mono">none detected</div>
              ) : (
                artifacts.map((a, i) => (
                  <ArtifactRow key={`${a.kind}-${i}-${a.value.slice(0, 16)}`} artifact={a} />
                ))
              )}
            </div>
          </div>

          <div className="mc-panel mc-corners p-4 flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="mc-label mc-label-brass">RELATED MESSAGES</span>
              <span className="mc-mono text-[10px] text-sand-dim">{messages.length}</span>
            </div>
            <div className="mc-scroll flex-1 overflow-auto flex flex-col gap-2">
              {messages.length === 0 ? (
                <div className="text-sand-dim text-xs mc-mono">no related messages</div>
              ) : (
                messages.map((m) => <MessageRow key={m.id} msg={m} />)
              )}
            </div>
          </div>
        </section>
      </main>

      <BottomBar telemetry={telemetry} />
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

interface ArtifactRowProps {
  artifact: ExtractedArtifact
}

function ArtifactRow({ artifact }: ArtifactRowProps) {
  if (artifact.kind === 'url') {
    return (
      <a
        href={artifact.value}
        target="_blank"
        rel="noreferrer"
        className="block text-xs mc-mono text-[var(--mc-cyan)] hover:underline break-all border-l-2 border-[var(--mc-cyan)]/40 pl-2 py-1"
      >
        <span className="mc-label mr-1.5 text-sand-dim">URL</span>
        {artifact.value}
      </a>
    )
  }

  if (artifact.kind === 'file') {
    return (
      <div
        className="text-xs mc-mono text-sand break-all border-l-2 border-[var(--mc-brass)]/40 pl-2 py-1"
        title="local path — open in file explorer"
      >
        <span className="mc-label mr-1.5 text-sand-dim">FILE</span>
        {artifact.value}
        <div className="text-[10px] text-sand-dim mt-0.5">local path</div>
      </div>
    )
  }

  return (
    <div className="text-xs border-l-2 border-[#22C55E]/40 pl-2 py-1">
      <div className="mc-label text-sand-dim mb-0.5">CMD</div>
      <code className="block mc-mono text-[#22C55E] bg-[rgba(34,197,94,0.06)] px-2 py-1 rounded whitespace-pre-wrap break-all">
        {artifact.value}
      </code>
    </div>
  )
}

interface MessageRowProps {
  msg: MissionMessage
}

function MessageRow({ msg }: MessageRowProps) {
  const time = new Date(msg.ts).toLocaleTimeString([], { hour12: false })
  return (
    <div className="text-xs border-l-2 border-[var(--mc-border)] pl-2 py-1 hover:border-[var(--mc-cyan)]/50 transition-colors">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="mc-label text-[var(--mc-brass)]">{msg.agentId.toUpperCase()}</span>
        <span className="mc-mono text-[10px] text-sand-dim">{time}</span>
      </div>
      <div className="mc-mono text-sand whitespace-pre-wrap break-words leading-snug">
        {msg.content.length > 320 ? `${msg.content.slice(0, 320)}…` : msg.content}
      </div>
    </div>
  )
}
