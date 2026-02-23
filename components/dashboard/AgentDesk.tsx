'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { AgentConfig } from '@/lib/agents'
import type { AgentStatus } from '@/components/providers/BridgeProvider'

interface AgentDeskProps {
  agent:  AgentConfig
  status: AgentStatus
  index:  number
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle:       'STANDBY',
  thinking:   'PROCESSING',
  responding: 'TRANSMITTING',
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle:       '#3B82F6',
  thinking:   '#F59E0B',
  responding: '#00F2FF',
}

export default function AgentDesk({ agent, status, index }: AgentDeskProps) {
  const statusColor = STATUS_COLORS[status]
  const statusLabel = STATUS_LABELS[status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
    >
      <Link href={`/dashboard/${agent.id}`} className="block group">
        <div
          className="relative rounded-2xl border transition-all duration-300 overflow-hidden"
          style={{
            background:   agent.bgColor,
            borderColor:  `${agent.color}20`,
            boxShadow:    `0 0 0 0 ${agent.color}00`,
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.borderColor = `${agent.color}45`
            ;(e.currentTarget as HTMLDivElement).style.boxShadow   = `0 0 24px ${agent.color}12`
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.borderColor = `${agent.color}20`
            ;(e.currentTarget as HTMLDivElement).style.boxShadow   = `0 0 0 0 ${agent.color}00`
          }}
        >
          {/* Top accent line */}
          <div
            className="absolute top-0 left-0 right-0 h-[1px] transition-opacity duration-300 opacity-40 group-hover:opacity-80"
            style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
          />

          <div className="p-6">
            {/* Header row */}
            <div className="flex items-start justify-between mb-5">
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center text-xl transition-all duration-300"
                style={{
                  borderColor: `${agent.color}35`,
                  background:  `${agent.color}10`,
                  color:       agent.color,
                }}
              >
                {agent.icon}
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: statusColor,
                    boxShadow:  status !== 'idle' ? `0 0 6px ${statusColor}` : 'none',
                  }}
                />
                <span
                  className="font-mono text-[9px] tracking-[0.2em]"
                  style={{ color: statusColor }}
                >
                  {statusLabel}
                </span>
              </div>
            </div>

            {/* Agent identity */}
            <div className="mb-1">
              <span
                className="font-mono text-xs font-bold tracking-[0.25em]"
                style={{ color: agent.color }}
              >
                {agent.label}
              </span>
            </div>
            <div className="font-display font-bold text-neural-text text-base leading-snug mb-1">
              {agent.title}
            </div>
            <div
              className="font-mono text-[10px] tracking-wider mb-4"
              style={{ color: `${agent.color}80` }}
            >
              {agent.specialty}
            </div>

            {/* Description */}
            <p className="text-neural-muted text-xs leading-relaxed line-clamp-2 mb-5">
              {agent.description}
            </p>

            {/* CTA */}
            <div
              className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] font-bold uppercase transition-all duration-200 group-hover:opacity-100 opacity-60"
              style={{ color: agent.color }}
            >
              <span>OPEN DESK</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
