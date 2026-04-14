'use client'

import { useCallback, useEffect, useState } from 'react'

interface CalendarEvent {
  id:           string
  summary:      string
  start:        string
  end:          string
  location?:    string
  description?: string
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    // All-day events have date-only strings (no T)
    if (!iso.includes('T')) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return d.toLocaleTimeString('en-US', {
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return iso
  }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function groupByDate(events: CalendarEvent[]): Array<{ date: string; items: CalendarEvent[] }> {
  const map = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const dateKey = fmtDate(ev.start)
    if (!map.has(dateKey)) map.set(dateKey, [])
    map.get(dateKey)!.push(ev)
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
}

// ── Edit form ─────────────────────────────────────────────────────────────

interface EditState {
  id:      string
  summary: string
  start:   string
  end:     string
}

function toDatetimeLocal(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    // format as YYYY-MM-DDTHH:mm for datetime-local input
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function EventEditRow({
  event,
  onSave,
  onCancel,
}: {
  event: EditState
  onSave: (patch: Partial<EditState>) => void
  onCancel: () => void
}) {
  const [summary, setSummary] = useState(event.summary)
  const [start,   setStart]   = useState(toDatetimeLocal(event.start))
  const [end,     setEnd]     = useState(toDatetimeLocal(event.end))
  const [saving,  setSaving]  = useState(false)

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave({
        summary,
        start: start ? new Date(start).toISOString() : undefined,
        end:   end   ? new Date(end).toISOString()   : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 space-y-1.5 p-2 border border-[var(--mc-cyan)] rounded bg-[rgba(0,212,255,0.04)]">
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Title"
        className="w-full bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[11px] text-sand placeholder:text-[var(--mc-text-mute)] focus:outline-none focus:border-[var(--mc-cyan)]"
      />
      <div className="flex gap-1.5">
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="flex-1 bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[10px] text-sand focus:outline-none focus:border-[var(--mc-cyan)]"
        />
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="flex-1 bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[10px] text-sand focus:outline-none focus:border-[var(--mc-cyan)]"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="mc-mono text-[10px] tracking-widest px-2.5 py-1 border border-[var(--mc-border)] text-[var(--mc-text-mute)] rounded hover:text-sand"
        >
          CANCEL
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mc-mono text-[10px] tracking-widest px-2.5 py-1 border border-[var(--mc-cyan)] text-[var(--mc-cyan)] rounded hover:bg-[rgba(0,212,255,0.10)] disabled:opacity-40"
        >
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
      </div>
    </div>
  )
}

// ── Add event form ────────────────────────────────────────────────────────

function AddEventForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [summary, setSummary] = useState('')
  const [start,   setStart]   = useState('')
  const [end,     setEnd]     = useState('')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  const handleCreate = async () => {
    if (!summary.trim() || !start || !end || saving) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/google/calendar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summary.trim(),
          start:   new Date(start).toISOString(),
          end:     new Date(end).toISOString(),
        }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'create failed')
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3 border border-[#22c55e] rounded bg-[rgba(34,197,94,0.04)] space-y-2">
      <div className="mc-label mc-label-brass text-[9px]">NEW EVENT</div>
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Title"
        className="w-full bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[11px] text-sand placeholder:text-[var(--mc-text-mute)] focus:outline-none focus:border-[#22c55e]"
      />
      <div className="flex gap-1.5">
        <div className="flex-1">
          <div className="mc-label text-[8px] mb-0.5">START</div>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[10px] text-sand focus:outline-none focus:border-[#22c55e]"
          />
        </div>
        <div className="flex-1">
          <div className="mc-label text-[8px] mb-0.5">END</div>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[10px] text-sand focus:outline-none focus:border-[#22c55e]"
          />
        </div>
      </div>
      {err && <div className="mc-label text-[#ff6060] text-[9px]">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="mc-mono text-[10px] tracking-widest px-2.5 py-1 border border-[var(--mc-border)] text-[var(--mc-text-mute)] rounded hover:text-sand"
        >
          CANCEL
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !summary.trim() || !start || !end}
          className="mc-mono text-[10px] tracking-widest px-2.5 py-1 border border-[#22c55e] text-[#22c55e] rounded hover:bg-[rgba(34,197,94,0.10)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'ADDING…' : 'ADD EVENT'}
        </button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────

export function CalendarPanel() {
  const [events,   setEvents]   = useState<CalendarEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [authUrl,  setAuthUrl]  = useState<string | null>(null)
  const [editing,  setEditing]  = useState<string | null>(null)
  const [adding,   setAdding]   = useState(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/google/calendar?days=7', { cache: 'no-store' })
      const data = (await res.json()) as {
        ok: boolean
        events?: CalendarEvent[]
        error?: string
        authUrl?: string
      }
      if (!data.ok) {
        if (data.authUrl) setAuthUrl(data.authUrl)
        setError(data.error ?? 'calendar error')
        return
      }
      setEvents(data.events ?? [])
      setAuthUrl(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleSaveEdit = async (id: string, patch: Partial<EditState>) => {
    try {
      const res = await fetch(`/api/google/calendar?id=${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'update failed')
      setEditing(null)
      await fetchEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed')
    }
  }

  const groups = groupByDate(events)

  return (
    <div className="mc-panel mc-corners flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)]">
        <span className="mc-label mc-label-brass">CALENDAR · 7 DAYS</span>
        <div className="flex items-center gap-2">
          {loading && <span className="mc-label text-[var(--mc-text-mute)]">SYNC</span>}
          {error && !authUrl && <span className="mc-label text-[#ff6060]">ERR</span>}
          <button
            onClick={() => { setAdding((v) => !v); setEditing(null) }}
            className="mc-mono text-[9px] tracking-widest px-2 py-0.5 border border-[#22c55e] text-[#22c55e] rounded hover:bg-[rgba(34,197,94,0.10)]"
          >
            + EVENT
          </button>
          <button
            onClick={fetchEvents}
            className="mc-mono text-[9px] tracking-widest px-2 py-0.5 border border-[var(--mc-border)] text-[var(--mc-text-mute)] rounded hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)]"
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-3 overflow-y-auto mc-scroll max-h-[400px]">
        {/* Auth prompt */}
        {authUrl && (
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="mc-label text-[var(--mc-text-mute)]">CALENDAR NOT CONNECTED</span>
            <a
              href={authUrl}
              target="_blank"
              rel="noreferrer"
              className="mc-mono text-[11px] tracking-widest px-4 py-2 border border-[var(--mc-cyan)] text-[var(--mc-cyan)] rounded hover:bg-[rgba(0,212,255,0.10)]"
            >
              CONNECT GOOGLE CALENDAR
            </a>
          </div>
        )}

        {/* Add event form */}
        {adding && (
          <AddEventForm
            onCreated={async () => { setAdding(false); await fetchEvents() }}
            onCancel={() => setAdding(false)}
          />
        )}

        {/* Empty state */}
        {!loading && !authUrl && events.length === 0 && (
          <div className="mc-label text-[var(--mc-text-mute)] text-center py-6">
            CALENDAR IS CLEAR
          </div>
        )}

        {/* Event groups */}
        {groups.map(({ date, items }) => (
          <div key={date}>
            <div className="mc-label mc-label-brass text-[9px] mb-1">{date}</div>
            <div className="space-y-1">
              {items.map((ev) => (
                <div
                  key={ev.id}
                  className="px-2 py-1.5 rounded border border-[rgba(0,212,255,0.12)] bg-[rgba(0,212,255,0.02)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-sand mc-mono truncate">{ev.summary}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="mc-mono text-[9px] text-[var(--mc-cyan)]">
                          {fmtTime(ev.start)}
                          {ev.end ? ` – ${fmtTime(ev.end)}` : ''}
                        </span>
                        {ev.location && (
                          <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] truncate max-w-[140px]">
                            {ev.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(editing === ev.id ? null : ev.id)}
                      className="mc-mono text-[9px] tracking-widest px-2 py-0.5 border border-[var(--mc-border)] text-[var(--mc-text-mute)] rounded hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)] shrink-0"
                    >
                      EDIT
                    </button>
                  </div>
                  {editing === ev.id && (
                    <EventEditRow
                      event={{ id: ev.id, summary: ev.summary, start: ev.start, end: ev.end }}
                      onSave={(patch) => handleSaveEdit(ev.id, patch)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
