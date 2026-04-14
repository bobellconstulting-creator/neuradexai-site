'use client'

/**
 * AgentHero — slim 64px-tall top strip shown above the AgentRoom constellation.
 * Identical on mobile and desktop. Contains: back button, agent icon + labels,
 * live graph status indicator.
 */

import type { AgentConfig } from '@/lib/agents'

export interface AgentHeroProps {
  agent:         AgentConfig
  onBack:        () => void
  graphLoading:  boolean
}

export function AgentHero({ agent, onBack, graphLoading }: AgentHeroProps) {
  return (
    <div
      className="mc-panel mc-corners flex items-center gap-3 px-3 sm:px-4"
      style={{ height: 64, minHeight: 64, flexShrink: 0 }}
    >
      {/* BACK */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Mission Control lobby"
        className="mc-mono text-xs tracking-widest text-[var(--mc-cyan)] border border-[var(--mc-border)] rounded hover:border-[var(--mc-cyan)] hover:bg-[rgba(0,212,255,0.08)] transition-colors flex items-center justify-center"
        style={{ minHeight: 44, minWidth: 80 }}
      >
        ← LOBBY
      </button>

      {/* CENTER — agent identity */}
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
        <span
          className="text-2xl sm:text-3xl shrink-0"
          style={{ color: agent.color }}
          aria-hidden="true"
        >
          {agent.icon}
        </span>
        <div className="flex flex-col min-w-0">
          <span
            className="mc-mono text-base sm:text-lg tracking-widest font-semibold truncate"
            style={{ color: agent.color }}
          >
            {agent.label}
          </span>
          <span className="mc-label text-[11px] truncate">{agent.title}</span>
        </div>
      </div>

      {/* RIGHT — graph status */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`mc-dot ${graphLoading ? 'mc-dot-warn' : 'mc-dot-on'}`}
          aria-hidden="true"
          style={graphLoading ? { animation: 'mc-pulse 1.2s ease-in-out infinite' } : undefined}
        />
        <span
          className="mc-mono text-[10px] sm:text-[11px] tracking-widest"
          style={{ color: graphLoading ? 'var(--mc-text-mute)' : '#B8923A' }}
          aria-live="polite"
        >
          {graphLoading ? 'GRAPH LOADING…' : 'GRAPH LIVE'}
        </span>
      </div>
    </div>
  )
}
