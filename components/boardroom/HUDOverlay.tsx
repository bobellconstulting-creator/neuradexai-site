'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { Agent } from '@/components/boardroom/boardroomData'

interface HUDOverlayProps {
  agents: Agent[]
  selectedAgent: Agent | null
}

const STATUS_COLORS: Record<string, string> = {
  idle:       'text-agent-idle',
  processing: 'text-agent-processing',
  speaking:   'text-agent-speaking',
}

export default function HUDOverlay({ agents, selectedAgent }: HUDOverlayProps) {
  const online = agents.length

  return (
    <div className="fixed inset-0 pointer-events-none z-10 font-mono">

      {/* ── Top Left: Branding ── */}
      <div className="absolute top-6 left-6">
        <div className="flex items-center gap-3 mb-1">
          {/* Logo mark */}
          <div className="w-8 h-8 rounded border border-[#00F2FF]/60 flex items-center justify-center text-[#00F2FF] text-sm font-bold">
            N
          </div>
          <div>
            <div className="text-[#00F2FF] text-xs tracking-[0.25em] font-bold">JARVIS / AXON</div>
            <div className="text-[#94a3b8] text-[10px] tracking-[0.2em]">COMMAND HUD v1.0</div>
          </div>
        </div>
        <div className="text-[#22C55E] text-[10px] tracking-[0.15em] mt-2">
          {online} / {online} AGENTS ONLINE
        </div>

        {/* Agent status list */}
        <div className="mt-3 space-y-1">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[9px] tracking-wider">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    a.status === 'speaking'   ? '#00F2FF' :
                    a.status === 'processing' ? '#22C55E' : '#3B82F6',
                  boxShadow: a.status === 'speaking' ? '0 0 6px #00F2FF' : 'none',
                }}
              />
              <span className="text-[#94a3b8]">{a.label}</span>
              <span className={
                a.status === 'speaking'   ? 'text-[#00F2FF]' :
                a.status === 'processing' ? 'text-[#22C55E]' : 'text-[#3B82F6]'
              }>
                {a.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Top Right: System Stats ── */}
      <div className="absolute top-6 right-6 text-right">
        <div className="inline-flex items-center gap-1.5 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded px-2 py-0.5 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-[#22C55E] text-[10px] tracking-[0.15em]">SYSTEM NOMINAL</span>
        </div>

        <div className="space-y-1.5">
          {[
            { label: 'CPU', value: '73%', bar: 73 },
            { label: 'MEM', value: '4.2 GB', bar: 52 },
            { label: 'TOK', value: '128K', bar: 85 },
          ].map(({ label, value, bar }) => (
            <div key={label} className="flex items-center gap-2 justify-end">
              <span className="text-[#94a3b8] text-[9px] tracking-wider">{label}</span>
              <div className="w-16 h-0.5 bg-[#1a1a2e] rounded overflow-hidden">
                <div
                  className="h-full bg-[#00F2FF] rounded"
                  style={{ width: `${bar}%`, opacity: 0.7 }}
                />
              </div>
              <span className="text-[#00F2FF] text-[9px] w-10 text-right">{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 text-[#94a3b8] text-[9px] tracking-wider">
          {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
        </div>
      </div>

      {/* ── Center Bottom: Selected Agent Info ── */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            key={selectedAgent.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-[168px] left-1/2 -translate-x-1/2 text-center"
          >
            <div className="text-[#00F2FF] text-sm tracking-[0.3em] font-bold">
              {selectedAgent.label}
            </div>
            <div className="inline-flex items-center gap-1.5 mt-1 border border-[#00F2FF]/30 rounded px-2.5 py-0.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    selectedAgent.status === 'speaking'   ? '#00F2FF' :
                    selectedAgent.status === 'processing' ? '#22C55E' : '#3B82F6',
                }}
              />
              <span className="text-[#94a3b8] text-[10px] tracking-wider">
                {selectedAgent.specialty}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corner decorations */}
      <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-[#00F2FF]/20" />
      <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-[#00F2FF]/20" />
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#00F2FF]/20" />
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-[#00F2FF]/20" />
    </div>
  )
}
