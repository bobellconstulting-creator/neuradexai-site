'use client'

import { useEffect, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProactiveMessage {
  ts: string
  content: string
  source: string
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

// ─── ProactiveLog ────────────────────────────────────────────────────────────

export function ProactiveLog() {
  const [messages, setMessages] = useState<ProactiveMessage[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch('/api/jarvis/proactive-log', { cache: 'no-store' })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const json = (await res.json()) as { ok: boolean; messages: ProactiveMessage[] }
        if (!cancelled && json.ok) {
          setMessages(json.messages.slice(-5).reverse())
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    void poll()
    const id = setInterval(() => { void poll() }, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="mc-panel mc-corners flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--mc-border)] shrink-0">
        {/* Pulsing green dot */}
        <span className="mc-dot mc-dot-on" />
        <span className="mc-label mc-label-brass">PROACTIVE ALERTS</span>
        {error && <span className="mc-label text-[#ff6060] ml-auto">ERR</span>}
      </div>

      {/* Messages */}
      <div className="overflow-y-auto mc-scroll px-3 py-2 space-y-1 max-h-[180px]">
        {messages.length === 0 && (
          <div className="mc-label text-center py-4">
            {error ? 'UNAVAILABLE' : 'No proactive alerts yet'}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.ts}
            className="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-[rgba(239,179,86,0.14)] bg-[rgba(239,179,86,0.03)]"
          >
            <div className="flex items-center gap-2">
              <span className="mc-mono text-[9px] text-[var(--mc-brass)] shrink-0 uppercase tracking-widest">
                {m.source}
              </span>
              <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] shrink-0">
                {relativeTime(m.ts)}
              </span>
            </div>
            <span className="mc-mono text-[11px] text-sand">
              {truncate(m.content, 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
