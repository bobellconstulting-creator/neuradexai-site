'use client'

import type { MissionTelemetry } from '@/lib/useMissionBridge'

interface TelemetryBarProps {
  telemetry: MissionTelemetry
}

interface BarProps {
  label: string
  value: number
  unit?: string
  max?: number
  color?: string
}

function Bar({ label, value, unit = '%', max = 100, color = '#00d4ff' }: BarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="mc-label w-14 shrink-0">{label}</span>
      <div className="relative flex-1 h-1.5 bg-[rgba(0,212,255,0.08)] rounded overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 mc-bar-grow"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}80)`,
            boxShadow: `0 0 10px ${color}80`,
          }}
        />
      </div>
      <span className="mc-mono text-[10px] text-sand w-12 text-right tabular-nums">
        {Math.round(value)}{unit}
      </span>
    </div>
  )
}

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
}

export function TelemetryBar({ telemetry }: TelemetryBarProps) {
  return (
    <div className="flex items-center gap-6 px-6 py-2 border-t border-[var(--mc-border)] bg-[rgba(5,7,20,0.7)] backdrop-blur-md overflow-x-auto">
      <div className="mc-label mc-label-brass">TELEMETRY</div>
      <Bar label="CPU" value={telemetry.cpu} color="#00d4ff" />
      <Bar label="MEM" value={telemetry.memory} color="#7b5cf0" />
      <Bar label="WS"  value={telemetry.wsLatency} unit="ms" max={400} color="#34d399" />
      <div className="flex items-center gap-2 ml-auto">
        <span className="mc-label">UPTIME</span>
        <span className="mc-mono text-xs text-sand tabular-nums">{fmtUptime(telemetry.uptimeSec)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`mc-dot ${telemetry.bridgeUp ? 'mc-dot-on' : 'mc-dot-warn'}`} />
        <span className="mc-label">{telemetry.bridgeUp ? 'BRIDGE :4000' : 'SIM MODE'}</span>
      </div>
    </div>
  )
}
