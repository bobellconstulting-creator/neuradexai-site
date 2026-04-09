'use client'

import { SystemStatusPills } from './SystemStatusPills'
import { TelemetryBar } from './TelemetryBar'
import type { MissionTelemetry } from '@/lib/useMissionBridge'

interface BottomBarProps {
  telemetry: MissionTelemetry
}

export function BottomBar({ telemetry }: BottomBarProps) {
  return (
    <footer className="relative z-10 flex flex-col">
      <div className="flex items-center gap-4 px-6 py-2 border-t border-[var(--mc-border)] bg-[rgba(5,7,20,0.6)]">
        <span className="mc-label mc-label-brass">SYSTEMS</span>
        <SystemStatusPills />
      </div>
      <TelemetryBar telemetry={telemetry} />
    </footer>
  )
}
