'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TopBar } from '@/components/mission-control/TopBar'
import { CalendarPanel } from '@/components/mission-control/CalendarPanel'
import { TaskBoard } from '@/components/mission-control/TaskBoard'
import { VoiceChat } from '@/components/mission-control/VoiceChat'
import { FileDropzone } from '@/components/mission-control/FileDropzone'

// ─── Jarvis status hook ───────────────────────────────────────────────────────

interface JarvisStatus {
  ok: boolean
  status: 'online' | 'offline'
  lastProvider: string | null
  lastActiveAt: string | null
}

function useJarvisStatus(pollMs = 30_000) {
  const [data, setData] = useState<JarvisStatus>({
    ok: false,
    status: 'offline',
    lastProvider: null,
    lastActiveAt: null,
  })

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch('/api/jarvis/status', { cache: 'no-store' })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const json = (await res.json()) as JarvisStatus
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setData((prev) => ({ ...prev, ok: false, status: 'offline' }))
      }
    }

    void check()
    const id = setInterval(() => { void check() }, pollMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [pollMs])

  return data
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(isoString: string | null): string {
  if (!isoString) return 'never'
  try {
    const diff = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  } catch {
    return 'unknown'
  }
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'chat' | 'tasks' | 'calendar' | 'docs'

// ─── Jarvis card ─────────────────────────────────────────────────────────────

function JarvisCard({ status }: { status: JarvisStatus }) {
  const isOnline = status.status === 'online'

  return (
    <div className="mc-panel mc-corners p-4 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`mc-dot ${isOnline ? 'mc-dot-on' : 'mc-dot-off'} shrink-0`}
          title={isOnline ? 'Gateway reachable' : 'Gateway offline'}
        />
        <span className="mc-mono text-sm tracking-[0.22em] font-bold text-[#00F2FF]">
          JARVIS
        </span>
        <span
          className="ml-auto mc-mono text-[10px] tracking-widest px-2 py-0.5 rounded border"
          style={{
            color:       isOnline ? '#22c55e' : '#ff6060',
            borderColor: isOnline ? 'rgba(34,197,94,0.30)' : 'rgba(255,96,96,0.30)',
            background:  isOnline ? 'rgba(34,197,94,0.06)' : 'rgba(255,96,96,0.06)',
          }}
        >
          {isOnline ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="mc-label">ROLE</span>
          <span className="mc-mono text-[11px] text-sand">Chief of Staff</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="mc-label">MODEL</span>
          <span className="mc-mono text-[11px] text-sand truncate max-w-[140px]" title={status.lastProvider ?? 'Kimi K2 (Groq)'}>
            {status.lastProvider ?? 'Kimi K2 (Groq)'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="mc-label">LAST ACTIVE</span>
          <span className="mc-mono text-[11px] text-[var(--mc-cyan)]">
            {relativeTime(status.lastActiveAt)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="mc-label">GATEWAY</span>
          <span className="mc-mono text-[11px] text-[var(--mc-text-mute)]">:18789</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="mc-label">TELEGRAM</span>
          <span className="mc-mono text-[11px] text-[var(--mc-text-mute)]">@Jarvis_bell_bot</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href="/jarvis"
          className="mc-mono text-[11px] tracking-widest text-center px-3 py-2 border border-[#00F2FF] text-[#00F2FF] rounded hover:bg-[rgba(0,242,255,0.10)] transition-colors"
        >
          VOICE INTERFACE →
        </Link>
        <Link
          href="/mission-control/agents/jarvis"
          className="mc-mono text-[11px] tracking-widest text-center px-3 py-2 border border-[var(--mc-border)] text-[var(--mc-text-mute)] rounded hover:border-[var(--mc-cyan)] hover:text-[var(--mc-cyan)] transition-colors"
        >
          AGENT DETAILS →
        </Link>
      </div>
    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'chat',     label: 'CHAT' },
    { id: 'tasks',    label: 'TASKS' },
    { id: 'calendar', label: 'CALENDAR' },
    { id: 'docs',     label: 'DOCS' },
  ]

  return (
    <div className="flex border-b border-[var(--mc-border)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 mc-mono text-[11px] tracking-widest py-3 border-b-2 transition-colors ${
            active === t.id
              ? 'border-[var(--mc-cyan)] text-[var(--mc-cyan)]'
              : 'border-transparent text-[var(--mc-text-mute)] hover:text-sand'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

function useDemoMode(): [boolean, () => void] {
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    try {
      setDemo(localStorage.getItem('jarvis_demo_mode') === '1')
    } catch {
      // localStorage unavailable (SSR / sandboxed)
    }
  }, [])

  const toggle = () => {
    setDemo((prev) => {
      const next = !prev
      try { localStorage.setItem('jarvis_demo_mode', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return [demo, toggle]
}

export default function MissionControlPage() {
  const jarvis = useJarvisStatus(30_000)
  const [tab, setTab] = useState<Tab>('chat')
  const [demo, toggleDemo] = useDemoMode()

  return (
    <div className={`mc-root${demo ? ' demo-mode' : ''}`}>
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={jarvis.ok} />

        {/* Main content */}
        <div className={`flex-1 min-h-0 flex flex-col md:flex-row p-3 gap-3 overflow-hidden mc-demo-center`}>

          {/* LEFT RAIL — full calendar (desktop only, hidden in demo mode) */}
          <aside className="mc-left-rail hidden md:flex flex-col gap-3 w-[320px] shrink-0">
            <JarvisCard status={jarvis} />
            <div className="flex-1 min-h-0 overflow-hidden">
              <CalendarPanel fullHeight />
            </div>
          </aside>

          {/* RIGHT MAIN — tabbed content */}
          <div className="flex-1 min-h-0 flex flex-col mc-panel mc-corners overflow-hidden">
            {/* Tab bar + demo toggle */}
            <div className="flex items-center border-b border-[var(--mc-border)]">
              <div className="flex-1">
                <TabBar active={tab} onChange={setTab} />
              </div>
              <button
                onClick={toggleDemo}
                className={`mc-demo-btn mc-mono text-[10px] tracking-widest px-3 py-1 border rounded mr-3 shrink-0 transition-colors ${
                  demo
                    ? 'text-[var(--mc-cyan)] border-[rgba(0,212,255,0.60)] bg-[rgba(0,212,255,0.10)]'
                    : 'text-[var(--mc-text-mute)] border-[var(--mc-border)] hover:border-[var(--mc-cyan)] hover:text-[var(--mc-cyan)]'
                }`}
                title="Toggle demo mode (iPhone viewport)"
              >
                {demo ? 'EXIT DEMO' : 'DEMO MODE'}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {tab === 'chat' && (
                <VoiceChat
                  agentId="jarvis"
                  agentColor="#00F2FF"
                  agentLabel="JARVIS"
                  channel="mission-control"
                />
              )}
              {tab === 'tasks' && (
                <TaskBoard />
              )}
              {tab === 'calendar' && (
                <div className="h-full overflow-y-auto mc-scroll">
                  <CalendarPanel />
                </div>
              )}
              {tab === 'docs' && (
                <div className="h-full overflow-hidden">
                  <FileDropzone />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Jarvis card strip */}
        <div className="md:hidden px-3 pb-2">
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-4">
            <span className={`mc-dot ${jarvis.ok ? 'mc-dot-on' : 'mc-dot-off'} shrink-0`} />
            <span className="mc-mono text-xs tracking-[0.22em] font-bold text-[#00F2FF]">JARVIS</span>
            <span className="mc-mono text-[10px] text-[var(--mc-text-mute)]">
              {jarvis.lastProvider ?? 'Kimi K2'}
            </span>
            <span className="ml-auto mc-mono text-[10px] text-[var(--mc-cyan)]">
              {relativeTime(jarvis.lastActiveAt)}
            </span>
            <Link
              href="/jarvis"
              className="mc-mono text-[10px] tracking-widest px-2.5 py-1 border border-[#00F2FF] text-[#00F2FF] rounded hover:bg-[rgba(0,242,255,0.10)]"
            >
              VOICE →
            </Link>
          </div>
        </div>

        {/* Bottom status bar removed — was noise */}
      </div>
    </div>
  )
}
