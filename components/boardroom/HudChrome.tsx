'use client'

import { useMemo } from 'react'
import type { AgentConfig } from '@/lib/agents'
import type { OrbState } from './AgentOrb'

interface HudChromeProps {
  agents: AgentConfig[]
  states: Record<string, OrbState>
  hoveredId: string | null
  isMobile: boolean
}

function StateLabel({ state }: { state: OrbState }) {
  const map: Record<OrbState, { label: string; color: string }> = {
    thinking: { label: 'PROCESSING', color: '#00e5ff' },
    alert:    { label: 'BLOCKED',    color: '#ff3366' },
    idle:     { label: 'STANDBY',    color: 'rgba(184,244,255,0.4)' },
    offline:  { label: 'OFFLINE',    color: 'rgba(184,244,255,0.2)' },
  }
  const { label, color } = map[state]
  return (
    <span style={{ color, fontSize: 10, letterSpacing: '0.12em' }}>{label}</span>
  )
}

export function HudChrome({ agents, states, hoveredId, isMobile }: HudChromeProps) {
  const hovered = hoveredId ? agents.find(a => a.id === hoveredId) : null
  const thinkingCount = useMemo(() =>
    agents.filter(a => states[a.id] === 'thinking').length,
    [agents, states]
  )
  const alertCount = useMemo(() =>
    agents.filter(a => states[a.id] === 'alert').length,
    [agents, states]
  )

  const safeArea: React.CSSProperties = {
    paddingTop:    'max(16px, env(safe-area-inset-top))',
    paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
    paddingLeft:   'max(16px, env(safe-area-inset-left))',
    paddingRight:  'max(16px, env(safe-area-inset-right))',
  }

  const mono = "'Share Tech Mono', 'Courier New', monospace"

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
      fontFamily: mono,
      ...safeArea,
    }}>
      {/* Corner brackets — top-left */}
      <svg
        style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))' }}
        width={64} height={64} viewBox="0 0 64 64" fill="none"
      >
        <path d="M0 24 L0 0 L24 0" stroke="#00e5ff" strokeWidth={1.5} opacity={0.7} />
      </svg>
      {/* Corner brackets — top-right */}
      <svg
        style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))' }}
        width={64} height={64} viewBox="0 0 64 64" fill="none"
      >
        <path d="M64 24 L64 0 L40 0" stroke="#00e5ff" strokeWidth={1.5} opacity={0.7} />
      </svg>
      {/* Corner brackets — bottom-left */}
      <svg
        style={{ position: 'absolute', bottom: 'max(12px, env(safe-area-inset-bottom))', left: 'max(12px, env(safe-area-inset-left))' }}
        width={64} height={64} viewBox="0 0 64 64" fill="none"
      >
        <path d="M0 40 L0 64 L24 64" stroke="#00e5ff" strokeWidth={1.5} opacity={0.7} />
      </svg>
      {/* Corner brackets — bottom-right */}
      <svg
        style={{ position: 'absolute', bottom: 'max(12px, env(safe-area-inset-bottom))', right: 'max(12px, env(safe-area-inset-right))' }}
        width={64} height={64} viewBox="0 0 64 64" fill="none"
      >
        <path d="M64 40 L64 64 L40 64" stroke="#00e5ff" strokeWidth={1.5} opacity={0.7} />
      </svg>

      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 'max(20px, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{
          fontSize: isMobile ? 13 : 16,
          letterSpacing: '0.3em',
          color: '#00e5ff',
          textShadow: '0 0 12px #00e5ff',
          fontWeight: 700,
        }}>
          NEURADEX // COMMAND
        </div>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.2em',
          color: 'rgba(184,244,255,0.45)',
        }}>
          HOLOGRAPHIC FLEET DISPLAY
        </div>
      </div>

      {/* Agent roster — right panel (desktop) / bottom (mobile) */}
      <div style={{
        position: 'absolute',
        ...(isMobile
          ? { bottom: 'max(80px, env(safe-area-inset-bottom))', left: 'max(16px, env(safe-area-inset-left))', right: 'max(16px, env(safe-area-inset-right))' }
          : { right: 'max(24px, env(safe-area-inset-right))', top: '50%', transform: 'translateY(-50%)' }
        ),
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        flexWrap: isMobile ? 'wrap' : 'nowrap',
        gap: isMobile ? 4 : 6,
        justifyContent: isMobile ? 'center' : 'flex-start',
      }}>
        {agents.map(agent => {
          const state = states[agent.id] ?? 'idle'
          return (
            <div key={agent.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: isMobile ? '3px 8px' : '4px 10px',
              borderLeft: isMobile ? 'none' : `2px solid ${state === 'idle' ? 'rgba(0,229,255,0.15)' : agent.color}`,
              borderBottom: isMobile ? `2px solid ${state === 'idle' ? 'rgba(0,229,255,0.15)' : agent.color}` : 'none',
              opacity: state === 'offline' ? 0.35 : 1,
              transition: 'opacity 0.3s',
            }}>
              <span style={{
                width: isMobile ? 5 : 6,
                height: isMobile ? 5 : 6,
                borderRadius: '50%',
                background: state === 'alert' ? '#ff3366' : state === 'thinking' ? agent.color : 'rgba(184,244,255,0.25)',
                boxShadow: state !== 'idle' ? `0 0 5px ${state === 'alert' ? '#ff3366' : agent.color}` : 'none',
                display: 'inline-block',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: isMobile ? 8 : 10,
                color: state === 'idle' ? 'rgba(184,244,255,0.5)' : '#fff',
                letterSpacing: '0.1em',
              }}>
                {agent.label}
              </span>
              {!isMobile && <StateLabel state={state} />}
            </div>
          )
        })}
      </div>

      {/* Stats — bottom-left */}
      <div style={{
        position: 'absolute',
        bottom: 'max(28px, env(safe-area-inset-bottom))',
        left: 'max(28px, env(safe-area-inset-left))',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div style={{ fontSize: 9, color: 'rgba(184,244,255,0.4)', letterSpacing: '0.15em' }}>
          FLEET STATUS
        </div>
        <div style={{ fontSize: 11, color: thinkingCount > 0 ? '#00e5ff' : 'rgba(184,244,255,0.4)', letterSpacing: '0.1em' }}>
          {thinkingCount} ACTIVE
        </div>
        {alertCount > 0 && (
          <div style={{ fontSize: 11, color: '#ff3366', letterSpacing: '0.1em' }}>
            {alertCount} BLOCKED
          </div>
        )}
      </div>

      {/* Hover nameplate — bottom-center */}
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: isMobile ? 'max(140px, calc(env(safe-area-inset-bottom) + 140px))' : 'max(44px, env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(2,6,12,0.85)',
          border: `1px solid ${hovered.color}`,
          boxShadow: `0 0 14px ${hovered.color}40`,
          padding: '10px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          minWidth: 160,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 13, color: hovered.color, letterSpacing: '0.2em', fontWeight: 700 }}>
            {hovered.label}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(184,244,255,0.55)', letterSpacing: '0.12em' }}>
            {hovered.role.toUpperCase()}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(184,244,255,0.35)', letterSpacing: '0.08em', marginTop: 2 }}>
            {hovered.model}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(184,244,255,0.4)', letterSpacing: '0.1em', marginTop: 2 }}>
            TAP TO OPEN CONSOLE
          </div>
        </div>
      )}
    </div>
  )
}
