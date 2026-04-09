'use client'

import { useMemo } from 'react'
import { getAgent } from '@/lib/agents'
import { useMissionStream } from '@/lib/useMissionStream'
import type { MissionMessage } from '@/lib/missionStream'

interface LiveFeedProps {
  /** Optional upstream simulated bridge events — shown beneath real messages */
  events?: Array<{
    id:         string
    timestamp:  number
    agentId:    string
    agentLabel: string
    kind:       'message' | 'task' | 'alert' | 'system'
    text:       string
  }>
}

const KIND_COLOR = {
  message: '#00d4ff',
  task:    '#34d399',
  alert:   '#ff6a55',
  system:  '#efb356',
} as const

const KIND_GLYPH = {
  message: '◇',
  task:    '▣',
  alert:   '!',
  system:  '◉',
} as const

function timeFmt(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

type FeedRow = {
  id:         string
  ts:         number
  agentLabel: string
  agentColor: string
  kind:       keyof typeof KIND_COLOR
  text:       string
  isReal:     boolean
}

function toFeedRows(
  messages: MissionMessage[],
  simulated: LiveFeedProps['events'] = [],
): FeedRow[] {
  const real: FeedRow[] = messages.map((m) => {
    const agent = getAgent(m.agentId)
    const isError = m.status === 'error'
    const isPending = m.status === 'pending'
    return {
      id:         m.id,
      ts:         m.ts,
      agentLabel: m.agentId === 'bo' ? 'BO' : (agent?.label ?? m.agentId.toUpperCase()),
      agentColor: m.agentId === 'bo' ? '#edf3ff' : (agent?.color ?? '#8aa0b8'),
      kind:       isError ? 'alert' : isPending ? 'system' : 'message',
      text:       m.content || (isPending ? '(awaiting response)' : '(empty)'),
      isReal:     true,
    }
  })

  const sim: FeedRow[] = (simulated ?? []).map((e) => ({
    id:         `sim-${e.id}`,
    ts:         e.timestamp,
    agentLabel: e.agentLabel,
    agentColor: '#8aa0b8',
    kind:       e.kind,
    text:       e.text,
    isReal:     false,
  }))

  return [...real, ...sim].sort((a, b) => b.ts - a.ts).slice(0, 40)
}

export function LiveFeed({ events = [] }: LiveFeedProps) {
  const { messages, error } = useMissionStream({ pollMs: 2000 })

  const rows = useMemo(() => toFeedRows(messages, events), [messages, events])
  const realCount = messages.length

  return (
    <div className="mc-panel mc-corners h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--mc-border)]">
        <div className="flex items-center gap-2">
          <span className="mc-dot mc-dot-on" />
          <span className="mc-label mc-label-brass">LIVE FEED</span>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="mc-label text-[#ff6060]">LINK ERR</span>}
          <span className="mc-label">{realCount.toString().padStart(3, '0')} REAL</span>
          <span className="mc-label text-[var(--mc-text-mute)]">{rows.length.toString().padStart(3, '0')} TOT</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mc-scroll px-3 py-2 space-y-1">
        {rows.length === 0 && (
          <div className="mc-label text-center py-8">AWAITING TRANSMISSION...</div>
        )}
        {rows.map((e) => (
          <div
            key={e.id}
            className={`mc-slide-in flex items-start gap-2 px-2 py-1.5 rounded border transition-colors ${
              e.isReal
                ? 'border-[rgba(0,212,255,0.12)] bg-[rgba(0,212,255,0.02)] hover:bg-[rgba(0,212,255,0.06)]'
                : 'border-transparent hover:border-[var(--mc-border)] hover:bg-[rgba(0,212,255,0.04)] opacity-70'
            }`}
          >
            <span className="mc-mono text-[10px] text-[var(--mc-text-mute)] pt-0.5 w-16 shrink-0">
              {timeFmt(e.ts)}
            </span>
            <span
              className="mc-mono text-xs pt-0.5 w-4 shrink-0 text-center"
              style={{ color: KIND_COLOR[e.kind] }}
            >
              {KIND_GLYPH[e.kind]}
            </span>
            <span
              className="mc-mono text-[10px] tracking-widest pt-0.5 w-14 shrink-0 truncate"
              style={{ color: e.agentColor }}
            >
              {e.agentLabel}
            </span>
            <span className="text-[11px] text-sand mc-mono truncate flex-1 pt-0.5">
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
