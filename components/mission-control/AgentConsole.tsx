'use client'

import type { MissionAgent, MissionEvent } from '@/lib/useMissionBridge'

interface AgentConsoleProps {
  agent: MissionAgent
  events: MissionEvent[]
}

const STATUS_LABEL: Record<MissionAgent['status'], string> = {
  online:  'ONLINE',
  busy:    'BUSY',
  idle:    'IDLE',
  offline: 'OFFLINE',
}

const STATUS_DOT: Record<MissionAgent['status'], string> = {
  online:  'mc-dot-on',
  busy:    'mc-dot-busy',
  idle:    'mc-dot-warn',
  offline: 'mc-dot-off',
}

export function AgentConsole({ agent, events }: AgentConsoleProps) {
  const recent = events.filter((e) => e.agentId === agent.id).slice(0, 4)

  return (
    <div
      className="mc-panel mc-corners mc-hover-glow p-3 flex flex-col gap-2 min-h-[170px]"
      style={{ borderColor: 'rgba(0,212,255,0.18)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`mc-dot ${STATUS_DOT[agent.status]}`} />
          <span
            className="mc-mono text-xs tracking-[0.22em] font-semibold"
            style={{ color: agent.color }}
          >
            {agent.label}
          </span>
        </div>
        <span className="mc-label">{STATUS_LABEL[agent.status]}</span>
      </div>

      {/* Role + model */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-sand-dim mc-mono uppercase tracking-wider truncate">
          {agent.role}
        </span>
        <span className="mc-label">{agent.latencyMs}ms</span>
      </div>
      <div className="text-[10px] text-[var(--mc-text-mute)] mc-mono truncate">
        model · {agent.model}
      </div>

      {/* Last action */}
      <div className="text-[11px] text-sand mc-mono truncate border-l-2 pl-2 mt-1" style={{ borderColor: agent.color }}>
        {agent.lastAction}
      </div>

      {/* Recent feed */}
      <div className="mt-auto pt-2 border-t border-[var(--mc-border)] mc-scroll overflow-hidden">
        {recent.length === 0 ? (
          <div className="mc-label text-[var(--mc-text-mute)]">NO RECENT TRAFFIC</div>
        ) : (
          recent.slice(0, 2).map((e) => (
            <div key={e.id} className="text-[10px] text-sand-dim mc-mono truncate leading-tight">
              <span style={{ color: agent.color }}>›</span> {e.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
