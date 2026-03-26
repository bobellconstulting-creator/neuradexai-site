'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { JarvisAgent } from './jarvisData'

// ── Subcomponents ──────────────────────────────────────────────────────────

function CornerBracket({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const top  = position.startsWith('t')
  const left = position.endsWith('l')
  return (
    <div
      className="absolute w-14 h-14 pointer-events-none"
      style={{
        [top  ? 'top'    : 'bottom']: '20px',
        [left ? 'left'   : 'right' ]: '20px',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          borderTop:    top    ? '2px solid rgba(255,140,0,0.75)'  : 'none',
          borderBottom: !top   ? '2px solid rgba(255,140,0,0.75)'  : 'none',
          borderLeft:   left   ? '2px solid rgba(255,140,0,0.75)'  : 'none',
          borderRight:  !left  ? '2px solid rgba(255,140,0,0.75)'  : 'none',
        }}
      />
      {/* Inner accent */}
      <div
        className="absolute"
        style={{
          [top  ? 'top'    : 'bottom']: '5px',
          [left ? 'left'   : 'right' ]: '5px',
          width: '18px',
          height: '18px',
          borderTop:    top    ? '1px solid rgba(0,212,255,0.35)' : 'none',
          borderBottom: !top   ? '1px solid rgba(0,212,255,0.35)' : 'none',
          borderLeft:   left   ? '1px solid rgba(0,212,255,0.35)' : 'none',
          borderRight:  !left  ? '1px solid rgba(0,212,255,0.35)' : 'none',
        }}
      />
    </div>
  )
}

function ArcReactorIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="shrink-0">
      <circle cx="19" cy="19" r="17" stroke="#00D4FF" strokeWidth="0.4" fill="none" opacity="0.25" />
      <circle cx="19" cy="19" r="13" stroke="#00D4FF" strokeWidth="0.7" fill="none" opacity="0.45" />
      <circle cx="19" cy="19" r="7.5" stroke="#00D4FF" strokeWidth="1.4" fill="none" opacity="0.7" />
      {[0, 60, 120, 180, 240, 300].map(deg => {
        const rad = (deg * Math.PI) / 180
        return (
          <line
            key={deg}
            x1={19 + Math.cos(rad) * 7.5}
            y1={19 + Math.sin(rad) * 7.5}
            x2={19 + Math.cos(rad) * 13}
            y2={19 + Math.sin(rad) * 13}
            stroke="#00D4FF"
            strokeWidth="0.9"
            opacity="0.55"
          />
        )
      })}
      <circle cx="19" cy="19" r="3.5" fill="#00D4FF" opacity="0.9" />
      <circle cx="19" cy="19" r="5.5" fill="#00D4FF" opacity="0.12" />
    </svg>
  )
}

function StatBar({
  label, value, bar, color,
}: { label: string; value: string; bar: number; color: string }) {
  return (
    <div className="flex items-center gap-2 justify-end text-[9px] font-mono">
      <span className="text-[#4FC3F7]/45 tracking-wider w-24 text-right">{label}</span>
      <div className="w-18 h-0.5 bg-[#001833] rounded overflow-hidden" style={{ width: '72px' }}>
        <div className="h-full rounded" style={{ width: `${bar}%`, background: color, opacity: 0.82 }} />
      </div>
      <span className="tracking-wider w-14 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

function TargetingReticle({ agent }: { agent: JarvisAgent }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.82 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-72 h-72 pointer-events-none font-mono"
    >
      {/* Outer slow-drift ring */}
      <div
        className="absolute inset-0 rounded-full border border-dashed border-[#00D4FF]/12 animate-spin"
        style={{ animationDuration: '30s' }}
      />

      {/* Orange fast-rotating arc */}
      <div
        className="absolute inset-4 rounded-full border-2 border-transparent animate-spin"
        style={{
          borderTopColor:   'rgba(255,140,0,0.8)',
          borderRightColor: 'rgba(255,140,0,0.2)',
          animationDuration: '4s',
        }}
      />

      {/* Blue counter arc */}
      <div
        className="absolute inset-4 rounded-full border-2 border-transparent animate-spin"
        style={{
          borderBottomColor: 'rgba(0,212,255,0.45)',
          borderLeftColor:   'rgba(0,212,255,0.15)',
          animationDuration: '7s',
          animationDirection: 'reverse',
        }}
      />

      {/* Inner ring */}
      <div
        className="absolute inset-8 rounded-full border border-[#00D4FF]/20 animate-spin"
        style={{ animationDuration: '18s' }}
      />

      {/* Cardinal tick marks */}
      {[0, 90, 180, 270].map(deg => (
        <div
          key={deg}
          className="absolute w-3 h-3"
          style={{
            top: '50%',
            left: '50%',
            transform: `translate(-50%,-50%) rotate(${deg}deg) translateY(-130px)`,
          }}
        >
          <div
            className="w-full h-full"
            style={{
              borderTop:   '2px solid rgba(255,140,0,0.7)',
              borderRight: '2px solid rgba(255,140,0,0.7)',
              transform:   `rotate(${45}deg)`,
            }}
          />
        </div>
      ))}

      {/* Center info */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <div className="text-[#00D4FF] text-sm tracking-[0.4em] font-bold">{agent.label}</div>
        <div className="text-[#4FC3F7]/55 text-[9px] tracking-[0.2em] uppercase">{agent.role}</div>
        <div className="w-16 h-px bg-[#FF8C00]/35 my-1.5" />
        <div className="text-[#FF8C00] text-[9px] tracking-[0.4em] font-bold">
          {agent.status.toUpperCase()}
        </div>
        <div className="text-[#4FC3F7]/30 text-[8px] tracking-widest mt-0.5">
          CLEARANCE: {agent.clearance}
        </div>
      </div>
    </motion.div>
  )
}

// ── Main HUD ───────────────────────────────────────────────────────────────

interface JarvisHUDProps {
  agents: JarvisAgent[]
  selectedAgent: JarvisAgent | null
}

export default function JarvisHUD({ agents, selectedAgent }: JarvisHUDProps) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () =>
      setTime(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC')
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  const speaking   = agents.filter(a => a.status === 'speaking').length
  const processing = agents.filter(a => a.status === 'processing').length

  return (
    <div className="fixed inset-0 pointer-events-none z-10 font-mono select-none">

      {/* Corner brackets */}
      <CornerBracket position="tl" />
      <CornerBracket position="tr" />
      <CornerBracket position="bl" />
      <CornerBracket position="br" />

      {/* ── TOP LEFT: Branding + Agent Manifest ── */}
      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-8 left-10 pl-6 pt-2"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <ArcReactorIcon />
          <div>
            <div className="text-[#00D4FF] text-xs tracking-[0.35em] font-bold">STARK AI BOARDROOM</div>
            <div className="text-[#FF8C00] text-[10px] tracking-[0.22em] mt-0.5">JARVIS ONLINE</div>
            <div className="text-[#4FC3F7]/35 text-[8px] tracking-[0.18em] mt-0.5">
              v3.0.2 · CLEARANCE: OMEGA
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 my-3">
          <div className="h-px flex-1 bg-[#00D4FF]/12" />
          <div className="text-[#4FC3F7]/35 text-[7px] tracking-[0.3em]">AGENT MANIFEST</div>
          <div className="h-px flex-1 bg-[#00D4FF]/12" />
        </div>

        {/* Agent list */}
        <div className="space-y-1.5">
          {agents.map(a => {
            const dotColor =
              a.status === 'speaking'   ? '#00FFFF' :
              a.status === 'processing' ? '#22C55E' :
              a.status === 'alert'      ? '#FF4444' : '#3B82F6'
            return (
              <div key={a.id} className="flex items-center gap-2.5 text-[9px] tracking-wider">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: dotColor,
                    boxShadow:  a.status !== 'idle' ? `0 0 6px ${dotColor}` : 'none',
                  }}
                />
                <span className="text-[#4FC3F7] w-[92px]">{a.label}</span>
                <span className="text-[#4FC3F7]/28 text-[7px] w-10">{a.clearance}</span>
                <span style={{ color: dotColor }}>{a.status.toUpperCase()}</span>
              </div>
            )
          })}
        </div>

        {/* Summary bar */}
        <div className="mt-3 pt-2 border-t border-[#00D4FF]/08 text-[9px] tracking-wider space-y-0.5">
          <div className="text-[#22C55E]">{agents.length} / {agents.length} AGENTS ONLINE</div>
          {speaking   > 0 && <div className="text-[#00FFFF]">{speaking} SPEAKING</div>}
          {processing > 0 && <div className="text-[#22C55E]">{processing} PROCESSING</div>}
        </div>
      </motion.div>

      {/* ── TOP RIGHT: System Stats ── */}
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-8 right-10 pr-6 pt-2 text-right"
      >
        {/* Status pill */}
        <div className="flex items-center justify-end gap-2 mb-3">
          <span className="text-[#22C55E] text-[9px] tracking-[0.22em]">ALL SYSTEMS NOMINAL</span>
          <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
        </div>

        {/* Stats */}
        <div className="space-y-1.5">
          <StatBar label="NEURAL CORE"  value="94.7%"   bar={95}  color="#00D4FF" />
          <StatBar label="BANDWIDTH"    value="2.4 TB"  bar={72}  color="#4FC3F7" />
          <StatBar label="TOKEN FLUX"   value="128K"    bar={85}  color="#00D4FF" />
          <StatBar label="QUANTUM SYN"  value="99.9%"   bar={99}  color="#FF8C00" />
          <StatBar label="ENCRYPTION"   value="AES-512" bar={100} color="#22C55E" />
        </div>

        {/* Timestamp */}
        <div className="mt-3 text-[#4FC3F7]/30 text-[9px] tracking-wider">{time}</div>

        {/* Mission tag */}
        <div className="mt-2 inline-flex items-center gap-1.5 border border-[#FF8C00]/28 rounded px-2 py-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF8C00] animate-pulse" />
          <span className="text-[#FF8C00] text-[9px] tracking-[0.18em]">MISSION: ACTIVE</span>
        </div>
      </motion.div>

      {/* ── CENTER: Targeting Reticle ── */}
      <AnimatePresence>
        {selectedAgent && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ paddingBottom: '165px' }}
          >
            <TargetingReticle agent={selectedAgent} />
          </div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM LEFT: Active Protocols ── */}
      <div className="absolute left-10 pl-6" style={{ bottom: '175px' }}>
        <div className="text-[#FF8C00]/55 text-[7px] tracking-[0.35em] mb-1.5">
          ACTIVE PROTOCOLS
        </div>
        {['NEURAL-SYNC v2.1', 'QUANTUM-ENCRYPT', 'THREAT-SCAN: ON', 'DEEP-LEARN: RUN'].map(p => (
          <div key={p} className="flex items-center gap-1.5 text-[8px] text-[#4FC3F7]/40 tracking-wider mb-0.5">
            <div className="w-1 h-1 rounded-full bg-[#22C55E]" />
            {p}
          </div>
        ))}
      </div>

      {/* ── BOTTOM RIGHT: Session ── */}
      <div className="absolute right-10 pr-6 text-right" style={{ bottom: '175px' }}>
        <div className="text-[#FF8C00]/55 text-[7px] tracking-[0.35em] mb-1.5">SESSION</div>
        <div className="text-[#4FC3F7]/35 text-[8px] tracking-wider">ID: NX-7734-ALPHA</div>
        <div className="text-[#4FC3F7]/35 text-[8px] tracking-wider mt-0.5">UPTIME: 4h 22m 18s</div>
        <div className="text-[#22C55E]/50 text-[8px] tracking-wider mt-0.5">SEC LEVEL: OMEGA</div>
      </div>

      {/* ── Tip: click agent ── */}
      <AnimatePresence>
        {!selectedAgent && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1.5, duration: 0.5 }}
            className="absolute bottom-[175px] left-1/2 -translate-x-1/2 text-center"
          >
            <div className="text-[#4FC3F7]/25 text-[8px] tracking-[0.3em]">
              CLICK AN AGENT TO ESTABLISH LINK
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
