'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolCallEntry {
  name: string
  ok: boolean
  durationMs?: number
}

interface FeedTurn {
  role: 'user' | 'assistant'
  content: string
  ts: string
  toolCalls?: ToolCallEntry[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch {
    return ''
  }
}

function truncate(str: string, max: number): string {
  const cleaned = str.replace(/\n/g, ' ').trim()
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned
}

// ─── ToolCall pills ──────────────────────────────────────────────────────────

function ToolPills({ calls }: { calls: ToolCallEntry[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {calls.map((c, i) => (
        <span
          key={i}
          className="mc-mono text-[9px] px-1.5 py-0.5 rounded border"
          style={{
            color:       c.ok ? '#34d399' : '#ff6a55',
            borderColor: c.ok ? 'rgba(52,211,153,0.30)' : 'rgba(255,106,85,0.30)',
            background:  c.ok ? 'rgba(52,211,153,0.06)' : 'rgba(255,106,85,0.06)',
          }}
        >
          {c.name} {c.ok ? '✓' : '✗'}
        </span>
      ))}
    </div>
  )
}

// ─── Feed row ────────────────────────────────────────────────────────────────

function FeedRow({ turn, isNew }: { turn: FeedTurn; isNew: boolean }) {
  const isUser = turn.role === 'user'

  return (
    <div
      className={`flex flex-col gap-0.5 px-2 py-1.5 rounded border transition-colors ${
        isNew ? 'mc-slide-in' : ''
      } ${
        isUser
          ? 'border-[rgba(0,212,255,0.12)] bg-[rgba(0,212,255,0.02)]'
          : 'border-[rgba(52,211,153,0.12)] bg-[rgba(52,211,153,0.02)]'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Role pill */}
        <span
          className="mc-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded border shrink-0"
          style={{
            color:       isUser ? '#00d4ff' : '#34d399',
            borderColor: isUser ? 'rgba(0,212,255,0.30)' : 'rgba(52,211,153,0.30)',
            background:  isUser ? 'rgba(0,212,255,0.08)' : 'rgba(52,211,153,0.08)',
          }}
        >
          {isUser ? 'USER' : 'JARVIS'}
        </span>
        {/* Timestamp */}
        <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] shrink-0">
          {relativeTime(turn.ts)}
        </span>
        {/* Content */}
        <span className="mc-mono text-[11px] text-sand truncate flex-1">
          {truncate(turn.content, 80)}
        </span>
      </div>
      {turn.toolCalls && turn.toolCalls.length > 0 && (
        <ToolPills calls={turn.toolCalls} />
      )}
    </div>
  )
}

// ─── LiveFeed ────────────────────────────────────────────────────────────────

export function LiveFeed() {
  const [turns, setTurns] = useState<FeedTurn[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevTsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch('/api/jarvis/live-feed', { cache: 'no-store' })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const json = (await res.json()) as { ok: boolean; turns: FeedTurn[] }
        if (!cancelled && json.ok) {
          const incoming = json.turns.slice(-10)
          // Identify new turns by ts (unique enough for a feed)
          const freshIds = new Set<string>()
          for (const t of incoming) {
            if (!prevTsRef.current.has(t.ts)) freshIds.add(t.ts)
          }
          prevTsRef.current = new Set(incoming.map((t) => t.ts))
          setNewIds(freshIds)
          setTurns(incoming)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    void poll()
    const id = setInterval(() => { void poll() }, 5_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Tail: scroll to bottom when turns change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  return (
    <div className="mc-panel mc-corners h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--mc-border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="mc-dot mc-dot-on" />
          <span className="mc-label mc-label-brass">LIVE FEED</span>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="mc-label text-[#ff6060]">LINK ERR</span>}
          <span className="mc-label">{turns.length.toString().padStart(3, '0')} TURNS</span>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto mc-scroll px-3 py-2 space-y-1">
        {turns.length === 0 && (
          <div className="mc-label text-center py-8">
            {error ? 'FEED UNAVAILABLE' : 'Waiting for Jarvis activity...'}
          </div>
        )}
        {turns.map((t) => (
          <FeedRow key={t.ts} turn={t} isNew={newIds.has(t.ts)} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
