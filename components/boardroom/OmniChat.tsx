'use client'

import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Agent, Message } from '@/components/boardroom/boardroomData'

interface OmniChatProps {
  agents: Agent[]
  selectedAgent: Agent | null
  chatMode: 'private' | 'broadcast'
  messages: Message[]
  onSend: (text: string) => void
  onToggleMode: () => void
}

export default function OmniChat({
  agents,
  selectedAgent,
  chatMode,
  messages,
  onSend,
  onToggleMode,
}: OmniChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const modeLabel =
    chatMode === 'private' && selectedAgent
      ? `PRIVATE: ${selectedAgent.label}`
      : 'BROADCAST ALL'

  const visibleMessages = messages.slice(-4)

  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="fixed bottom-0 left-0 right-0 z-20 font-mono"
      style={{ background: 'rgba(10, 14, 23, 0.88)', borderTop: '1px solid rgba(0, 242, 255, 0.15)' }}
    >
      {/* Mode Toggle Bar */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-[#00F2FF]/10">
        <button
          onClick={onToggleMode}
          className={`text-[10px] tracking-[0.2em] px-2.5 py-0.5 rounded border transition-colors ${
            chatMode === 'private'
              ? 'border-[#00F2FF]/60 text-[#00F2FF] bg-[#00F2FF]/8'
              : 'border-[#94a3b8]/20 text-[#94a3b8]'
          }`}
        >
          ⬡ {chatMode === 'private' && selectedAgent ? `PRIVATE: ${selectedAgent.label}` : 'PRIVATE'}
        </button>

        {/* Toggle indicator */}
        <div
          className="relative w-8 h-4 rounded-full border border-[#00F2FF]/30 cursor-pointer"
          onClick={onToggleMode}
          style={{ background: 'rgba(0,242,255,0.05)' }}
        >
          <motion.div
            animate={{ x: chatMode === 'broadcast' ? 16 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-[#00F2FF]"
          />
        </div>

        <button
          onClick={onToggleMode}
          className={`text-[10px] tracking-[0.2em] px-2.5 py-0.5 rounded border transition-colors ${
            chatMode === 'broadcast'
              ? 'border-[#00F2FF]/60 text-[#00F2FF] bg-[#00F2FF]/8'
              : 'border-[#94a3b8]/20 text-[#94a3b8]'
          }`}
        >
          ⬡ BROADCAST ALL
        </button>

        <div className="ml-auto text-[9px] text-[#94a3b8]/50 tracking-wider">
          {messages.length} / 20 MSGS
        </div>
      </div>

      {/* Message History */}
      <div
        ref={scrollRef}
        className="px-6 py-2 space-y-1 overflow-y-auto"
        style={{ maxHeight: '80px' }}
      >
        {visibleMessages.map((msg) => {
          const isUser = msg.role === 'user'
          const target = msg.agentId === 'all' ? 'ALL' : agents.find((a) => a.id === msg.agentId)?.label ?? msg.agentId
          return (
            <div key={msg.id} className={`flex gap-2 text-[10px] leading-relaxed ${isUser ? 'text-[#e2e8f0]' : 'text-[#00F2FF]'}`}>
              <span className="text-[#94a3b8]/50 shrink-0 w-[52px]">
                {isUser ? `[YOU→${target}]` : ''}
              </span>
              <span>{msg.text}</span>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-[#00F2FF]/8" />

      {/* Input Row */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 px-6 py-2.5">
        <span className="text-[#00F2FF]/60 text-xs">›</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Transmit to ${chatMode === 'private' && selectedAgent ? selectedAgent.label : 'ALL AGENTS'}...`}
          className="flex-1 bg-transparent border-none outline-none text-[#e2e8f0] text-xs placeholder:text-[#94a3b8]/30 tracking-wide"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="text-[10px] tracking-[0.2em] px-3 py-1 border border-[#00F2FF]/40 text-[#00F2FF] rounded hover:bg-[#00F2FF]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          TRANSMIT ▶
        </button>
      </form>
    </motion.div>
  )
}
