'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AGENTS } from '@/lib/agents'
import { useBridge } from '@/hooks/useBridge'

export default function AppSidebar() {
  const pathname = usePathname()
  const { agentStatuses, bridgeStatus } = useBridge()

  const statusDot: Record<string, { color: string; label: string; pulse?: boolean }> = {
    idle:       { color: '#3B82F6', label: 'IDLE' },
    thinking:   { color: '#F59E0B', label: 'THINKING' },
    responding: { color: '#00F2FF', label: 'ACTIVE',  pulse: true },
  }

  return (
    <aside
      className="flex flex-col w-56 shrink-0 h-full border-r border-neural-indigo-mid/20"
      style={{ background: 'rgba(5, 5, 10, 0.9)', backdropFilter: 'blur(16px)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-neural-indigo-mid/20">
        <div className="w-7 h-7 rounded-lg bg-neural-cyan/10 border border-neural-cyan/30 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-neural-cyan" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <div>
          <div className="font-display font-black text-neural-text text-sm tracking-tight leading-none">
            Jarvis<span className="text-neural-cyan">/Axon</span>
          </div>
          <div className="font-mono text-[8px] text-neural-muted/50 tracking-[0.2em] mt-0.5">
            COMMAND HUD
          </div>
        </div>
      </div>

      {/* Nav header */}
      <div className="px-4 pt-5 pb-2">
        <span className="font-mono text-[9px] text-neural-muted/40 tracking-[0.25em] uppercase">
          Agent Fleet
        </span>
      </div>

      {/* Agent list */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {/* Boardroom overview link */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group ${
            pathname === '/dashboard'
              ? 'bg-neural-indigo/40 border border-neural-indigo-mid/30'
              : 'hover:bg-neural-indigo/20'
          }`}
        >
          <span className="text-neural-cyan text-xs">⬢</span>
          <span className="font-mono text-[11px] text-neural-muted group-hover:text-neural-text transition-colors tracking-wider">
            OVERVIEW
          </span>
        </Link>

        <div className="my-2 border-t border-neural-indigo-mid/15" />

        {AGENTS.map((agent) => {
          const isActive = pathname === `/dashboard/${agent.id}`
          const status   = agentStatuses[agent.id] ?? 'idle'
          const dot      = statusDot[status]

          return (
            <Link
              key={agent.id}
              href={`/dashboard/${agent.id}`}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
                isActive
                  ? 'border'
                  : 'hover:bg-neural-indigo/20 border border-transparent'
              }`}
              style={
                isActive
                  ? { background: `${agent.bgColor}`, borderColor: `${agent.color}30` }
                  : {}
              }
            >
              {/* Agent icon */}
              <span
                className="text-sm leading-none shrink-0"
                style={{ color: agent.color }}
              >
                {agent.icon}
              </span>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <div
                  className="font-mono text-[11px] font-bold tracking-wider truncate"
                  style={{ color: isActive ? agent.color : undefined }}
                >
                  {isActive ? agent.label : <span className="text-neural-muted group-hover:text-neural-text transition-colors">{agent.label}</span>}
                </div>
                <div className="font-mono text-[9px] text-neural-muted/50 truncate">
                  {agent.specialty.split(' ')[0]}
                </div>
              </div>

              {/* Status dot */}
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background: dot.color,
                  boxShadow: dot.pulse ? `0 0 6px ${dot.color}` : 'none',
                }}
              />
            </Link>
          )
        })}
      </nav>

      {/* Bridge status footer */}
      <div className="px-4 py-4 border-t border-neural-indigo-mid/20 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: bridgeStatus === 'connected' ? '#22C55E' : bridgeStatus === 'connecting' ? '#F59E0B' : '#EF4444',
              boxShadow: bridgeStatus === 'connected' ? '0 0 6px #22C55E' : 'none',
            }}
          />
          <span className="font-mono text-[9px] text-neural-muted/50 tracking-wider">
            BRIDGE {bridgeStatus.toUpperCase()}
          </span>
        </div>
        <Link
          href="/"
          className="block font-mono text-[9px] text-neural-muted/30 hover:text-neural-muted/60 tracking-wider transition-colors"
        >
          ← HUD ENTRY
        </Link>
      </div>
    </aside>
  )
}
