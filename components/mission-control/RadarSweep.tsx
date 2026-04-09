'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MissionAgent } from '@/lib/useMissionBridge'

interface RadarSweepProps {
  agents:    MissionAgent[]
  taskCount: number
}

export function RadarSweep({ agents, taskCount }: RadarSweepProps) {
  const router = useRouter()
  // Animate task count up on mount
  const [displayCount, setDisplayCount] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 900)
      setDisplayCount(Math.round(t * taskCount))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [taskCount])

  const VB = 480 // viewBox
  const C = VB / 2
  const RADII = [60, 110, 160, 210]

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg viewBox={`0 0 ${VB} ${VB}`} className="w-full h-full max-w-[640px] max-h-[640px]">
        <defs>
          <radialGradient id="mc-radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#00d4ff" stopOpacity="0.10" />
            <stop offset="60%" stopColor="#00d4ff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="mc-sweep" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#00d4ff" stopOpacity="0" />
            <stop offset="60%"  stopColor="#00d4ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.7" />
          </linearGradient>

          <radialGradient id="mc-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Backdrop wash */}
        <circle cx={C} cy={C} r={220} fill="url(#mc-radar-bg)" />

        {/* Concentric rings */}
        {RADII.map((r) => (
          <circle
            key={r}
            cx={C}
            cy={C}
            r={r}
            fill="none"
            stroke="rgba(0,212,255,0.18)"
            strokeWidth={1}
          />
        ))}

        {/* Cross hairs */}
        <line x1={C - 220} y1={C} x2={C + 220} y2={C} stroke="rgba(239,179,86,0.20)" strokeDasharray="2 6" />
        <line x1={C} y1={C - 220} x2={C} y2={C + 220} stroke="rgba(239,179,86,0.20)" strokeDasharray="2 6" />

        {/* Sweep wedge with fading trail */}
        <g className="mc-radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
          <path
            d={`M ${C} ${C} L ${C + 220} ${C} A 220 220 0 0 0 ${C + 220 * Math.cos(-Math.PI / 3)} ${C + 220 * Math.sin(-Math.PI / 3)} Z`}
            fill="url(#mc-sweep)"
          />
          <line x1={C} y1={C} x2={C + 220} y2={C} stroke="#00d4ff" strokeWidth={1.4} />
        </g>

        {/* Connection lines from core to nodes (animated dash flow) */}
        {agents.map((a) => {
          const rad = (a.angle * Math.PI) / 180
          const r = 200 * a.orbit
          const x = C + r * Math.cos(rad)
          const y = C + r * Math.sin(rad)
          return (
            <line
              key={`line-${a.id}`}
              x1={C}
              y1={C}
              x2={x}
              y2={y}
              stroke={a.color}
              strokeOpacity={0.35}
              strokeWidth={1}
              className="mc-flow-line"
            />
          )
        })}

        {/* Agent nodes with ping ring */}
        {agents.map((a) => {
          const rad = (a.angle * Math.PI) / 180
          const r = 200 * a.orbit
          const x = C + r * Math.cos(rad)
          const y = C + r * Math.sin(rad)
          const isBusy = a.status === 'busy'
          const isOff = a.status === 'offline'
          return (
            <g
              key={a.id}
              className="mc-ping cursor-pointer"
              onClick={() => router.push(`/mission-control/agents/${a.id}`)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible hit area — bigger than the visible node so clicks are easy */}
              <circle cx={x} cy={y} r={26} fill="transparent" />
              <circle cx={x} cy={y} r={6} fill={a.color} opacity={isOff ? 0.3 : 1} />
              <circle cx={x} cy={y} r={6} fill="none" stroke={a.color} strokeWidth={1.5} />
              {/* hex frame */}
              <polygon
                points={hexPoints(x, y, 14)}
                fill="none"
                stroke={a.color}
                strokeOpacity={0.55}
                strokeWidth={1}
              />
              <text
                x={x}
                y={y + 30}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
                fontSize={9}
                fill={a.color}
                letterSpacing={2}
                style={{ pointerEvents: 'none' }}
              >
                {a.label}
              </text>
              {isBusy && (
                <circle cx={x} cy={y} r={18} fill="none" stroke={a.color} strokeOpacity={0.45} strokeWidth={1} className="mc-slow-pulse" />
              )}
            </g>
          )
        })}

        {/* Core */}
        <circle cx={C} cy={C} r={42} fill="url(#mc-core)" />
        <circle cx={C} cy={C} r={28} fill="none" stroke="#00d4ff" strokeOpacity={0.7} />
        <polygon points={hexPoints(C, C, 22)} fill="none" stroke="#efb356" strokeOpacity={0.7} />
        <text x={C} y={C - 4} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={9} fill="#efb356" letterSpacing={2}>
          ACTIVE TASKS
        </text>
        <text x={C} y={C + 16} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={20} fontWeight={600} fill="#edf3ff">
          {displayCount.toString().padStart(2, '0')}
        </text>
      </svg>

      {/* Corner readouts overlay */}
      <div className="absolute top-2 left-3 mc-label">SECTOR · NEURADEX</div>
      <div className="absolute top-2 right-3 mc-label mc-label-cyan">SCAN 6.0s</div>
      <div className="absolute bottom-2 left-3 mc-label">RANGE · ALL</div>
      <div className="absolute bottom-2 right-3 mc-label mc-label-brass">LOCK · NOMINAL</div>
    </div>
  )
}

function hexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}
