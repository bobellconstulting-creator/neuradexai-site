'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import { useAgentChat } from '@/hooks/useAgentChat'
import { useBridge } from '@/hooks/useBridge'
import type { AgentConfig } from '@/lib/agents'

interface ChatWindowProps {
  agent: AgentConfig
}

export default function ChatWindow({ agent }: ChatWindowProps) {
  const { messages, status, send } = useAgentChat(agent.id)
  const { bridgeStatus } = useBridge()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isOffline = bridgeStatus === 'disconnected'

  return (
    <div className="flex flex-col h-full">
      {/* Agent header */}
      <div
        className="flex items-center gap-4 px-6 py-4 border-b border-neural-indigo-mid/20 shrink-0"
        style={{ background: agent.bgColor }}
      >
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg shrink-0"
          style={{
            borderColor: `${agent.color}40`,
            background:  `${agent.color}10`,
          }}
        >
          <span style={{ color: agent.color }}>{agent.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-sm font-bold tracking-wider"
              style={{ color: agent.color }}
            >
              {agent.label}
            </span>
            <span className="font-mono text-[10px] text-neural-muted/50 tracking-wider">
              —
            </span>
            <span className="font-mono text-[10px] text-neural-muted/60 tracking-wider truncate">
              {agent.title}
            </span>
          </div>
          <div className="font-mono text-[10px] text-neural-muted/40 tracking-wider mt-0.5">
            {agent.specialty}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background:
                status === 'responding' ? agent.color :
                status === 'thinking'   ? '#F59E0B' : '#3B82F6',
              boxShadow:
                status !== 'idle' ? `0 0 6px ${status === 'thinking' ? '#F59E0B' : agent.color}` : 'none',
            }}
          />
          <span className="font-mono text-[10px] text-neural-muted/50 tracking-wider">
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Bridge offline banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="px-6 py-2 font-mono text-[10px] text-amber-400/80 tracking-wider bg-amber-950/20 border-b border-amber-900/30">
              ⚠ BRIDGE OFFLINE — Start bridge server: <code className="text-amber-300">npm run bridge</code>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center select-none">
            <div
              className="text-4xl mb-4 opacity-30"
              style={{ color: agent.color }}
            >
              {agent.icon}
            </div>
            <div
              className="font-mono text-sm font-bold tracking-[0.25em] opacity-40 mb-1"
              style={{ color: agent.color }}
            >
              {agent.label}
            </div>
            <div className="font-mono text-[11px] text-neural-muted/30 tracking-wider">
              Issue a directive to begin the session
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} agent={agent} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0">
        <ChatInput agent={agent} status={status} onSend={send} />
      </div>
    </div>
  )
}
