'use client'

import Link from 'next/link'
import { MissionClock } from './MissionClock'

interface TopBarProps {
  bridgeUp: boolean
}

export function TopBar({ bridgeUp }: TopBarProps) {
  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-[var(--mc-border)] bg-[rgba(5,7,20,0.7)] backdrop-blur-md">
      {/* Left: brand */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="mc-label flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--mc-border)] hover:border-[var(--mc-cyan)] hover:text-[var(--mc-cyan)] transition-colors"
        >
          <span>&larr;</span>
          <span>DASHBOARD</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 rotate-45 border border-[var(--mc-cyan)] mc-slow-pulse" />
            <div className="absolute inset-1 rotate-45 border border-[var(--mc-brass)] opacity-70" />
            <div className="absolute inset-0 flex items-center justify-center text-[var(--mc-cyan)] text-xs mc-mono">N</div>
          </div>
          <div className="flex flex-col leading-none">
            <span className="mc-label text-[var(--mc-brass)]">NEURADEX AI</span>
            <span className="text-sand text-sm tracking-[0.18em] mc-mono">MISSION CONTROL</span>
          </div>
        </div>
      </div>

      {/* Center: live indicator */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--mc-border)] bg-[rgba(0,212,255,0.05)]">
        <span className={`mc-dot ${bridgeUp ? 'mc-dot-on' : 'mc-dot-warn'}`} />
        <span className="mc-label">{bridgeUp ? 'LIVE · BRIDGE LINKED' : 'SIMULATED FEED'}</span>
      </div>

      {/* Right: clock + operator */}
      <div className="flex items-center gap-6">
        <MissionClock />
        <div className="flex items-center gap-2 pl-4 border-l border-[var(--mc-border)]">
          <div className="w-7 h-7 rounded-full border border-[var(--mc-brass)] flex items-center justify-center text-[var(--mc-brass)] mc-mono text-xs">
            BB
          </div>
          <div className="flex flex-col leading-none">
            <span className="mc-label">OPERATOR</span>
            <span className="text-sand text-xs mc-mono">BO BELL</span>
          </div>
        </div>
      </div>
    </header>
  )
}
