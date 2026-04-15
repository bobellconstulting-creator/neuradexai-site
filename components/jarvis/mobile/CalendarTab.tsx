'use client'

import { useEffect, useState } from 'react'

interface CalEvent {
  id: string
  summary: string
  start: string
  end: string
  location?: string
  description?: string
  calendarName?: string
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    // All-day events have date-only ISO strings (no T)
    if (!iso.includes('T')) return 'All day'
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return iso
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()

    if (isSameDay(d, today)) return 'Today'
    if (isSameDay(d, tomorrow)) return 'Tomorrow'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function groupByDate(events: CalEvent[]): Array<{ label: string; events: CalEvent[] }> {
  const map = new Map<string, CalEvent[]>()
  for (const ev of events) {
    const key = (ev.start ?? '').split('T')[0] ?? ev.start
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ev)
  }
  return Array.from(map.entries()).map(([key, evs]) => ({
    label: formatDate(key),
    events: evs,
  }))
}

export default function CalendarTab() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)

  const load = (d: number) => {
    setLoading(true)
    setError(null)
    fetch(`/api/google/calendar?days=${d}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text()
          throw new Error(txt.slice(0, 120))
        }
        return r.json() as Promise<{ ok: boolean; events?: CalEvent[]; error?: string }>
      })
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? 'Unknown error')
        setEvents(data.events ?? [])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(days) }, [days])

  const groups = groupByDate(events)

  return (
    <div className="flex flex-col h-full bg-transparent text-white">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="font-mono text-xs tracking-widest text-[#00D4FF]/70 uppercase">Calendar</span>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                days === d
                  ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                  : 'text-white/30 border border-white/10 hover:text-white/60'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && (
          <div className="flex justify-center pt-10">
            <span className="font-mono text-xs text-[#00D4FF]/40 animate-pulse tracking-widest">
              LOADING…
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <p className="font-mono text-xs text-red-400">{error}</p>
            {error.includes('OAuth') || error.includes('token') ? (
              <p className="mt-1 text-[11px] text-white/30">
                Visit <span className="text-[#00D4FF]/60">/api/google/auth</span> to reconnect Calendar.
              </p>
            ) : null}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex justify-center pt-10">
            <span className="font-mono text-xs text-white/20 tracking-widest">NO EVENTS</span>
          </div>
        )}

        {!loading && !error && groups.map((group) => (
          <div key={group.label}>
            <p className="font-mono text-[10px] tracking-widest text-white/30 uppercase mb-2">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
                >
                  <p className="text-[13px] text-white leading-snug">{ev.summary}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#00D4FF]/60">
                    {formatTime(ev.start)}
                    {ev.end && ev.start !== ev.end ? ` – ${formatTime(ev.end)}` : ''}
                  </p>
                  {ev.location && (
                    <p className="mt-0.5 text-[11px] text-white/30 truncate">{ev.location}</p>
                  )}
                  {ev.calendarName && ev.calendarName !== 'primary' && (
                    <p className="mt-0.5 text-[10px] text-white/20 uppercase tracking-wider">{ev.calendarName}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Refresh */}
      <div className="flex-none px-4 py-3 border-t border-white/5">
        <button
          onClick={() => load(days)}
          disabled={loading}
          className="w-full py-2 rounded-xl border border-white/10 text-[12px] font-mono text-white/40 hover:text-white/70 hover:border-white/20 transition-colors disabled:opacity-30"
        >
          {loading ? 'LOADING…' : 'REFRESH'}
        </button>
      </div>
    </div>
  )
}
