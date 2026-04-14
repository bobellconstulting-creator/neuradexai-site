'use client'

/**
 * StackingBar — row of hand-off chips for the other 3 agents. Taps fire
 * onHandOff with the target agent id; the parent decides what to do (the
 * Agent Room prefills ChatDock with "@target hand-off from @current: ").
 *
 * Mobile: full-width row above ChatDock.
 * Desktop: floats bottom-center above ChatDock.
 */

import { AGENTS, type AgentConfig } from '@/lib/agents'

export interface StackingBarProps {
  currentAgent: AgentConfig
  onHandOff:    (targetAgentId: string) => void
}

export function StackingBar({ currentAgent, onHandOff }: StackingBarProps) {
  const others = AGENTS.filter((a) => a.id !== currentAgent.id)

  return (
    <div
      className="
        mc-panel mc-corners
        flex items-center gap-2 px-3
        overflow-x-auto mc-scroll
        lg:fixed lg:left-1/2 lg:-translate-x-1/2 lg:bottom-[80px] lg:max-w-[720px] lg:justify-center lg:overflow-visible
      "
      style={{
        flexShrink: 0,
        minHeight:  56,
        height:     56,
        zIndex:     50,
      }}
      aria-label="Hand off to another agent"
    >
      <span className="mc-label mc-label-brass text-[10px] shrink-0 hidden sm:block">
        HAND OFF
      </span>
      <div className="flex items-center gap-2 flex-1 lg:flex-none">
        {others.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => onHandOff(target.id)}
            aria-label={`Hand off to ${target.displayName}`}
            className="mc-mono text-[10px] tracking-widest border rounded px-3 flex items-center gap-2 hover:brightness-125 transition-all shrink-0"
            style={{
              minHeight:   44,
              borderColor: target.color,
              color:       target.color,
              background:  target.bgColor,
            }}
          >
            <span aria-hidden="true">{target.icon}</span>
            <span>→ @{target.id.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
