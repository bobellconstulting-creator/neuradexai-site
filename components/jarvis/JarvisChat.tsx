'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { JarvisAgent, JarvisMessage } from './jarvisData'

interface JarvisChatProps {
  agents: JarvisAgent[]
  selectedAgent: JarvisAgent | null
  chatMode: 'private' | 'broadcast'
  messages: JarvisMessage[]
  onSend: (text: string) => void
  onToggleMode: () => void
}

export default function JarvisChat({
  agents,
  selectedAgent,
  chatMode,
  messages,
  onSend,
  onToggleMode,
}: JarvisChatProps) {
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    setThinking(true)
    onSend(text)
    setInput('')
    setTimeout(() => setThinking(false), 1600)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const placeholder =
    chatMode === 'private' && selectedAgent
      ? `Direct link to ${selectedAgent.label}...`
      : 'Broadcast transmission to all agents...'

  return (
    <motion.div
      initial={{ y: 150, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.65, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-0 left-0 right-0 z-20 font-mono"
      style={{
        background:     'rgba(0, 6, 18, 0.93)',
        borderTop:      '1px solid rgba(255, 140, 0, 0.3)',
        backdropFilter: 'blur(14px)',
      }}
    >
      {/* Orange gradient top edge */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#FF8C00]/45 to-transparent" />

      {/* ── Mode toggle bar ── */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-[#00D4FF]/07">
        <button
          onClick={onToggleMode}
          className={`text-[10px] tracking-[0.2em] px-3 py-1 rounded border transition-all ${
            chatMode === 'private'
              ? 'border-[#FF8C00]/55 text-[#FF8C00] bg-[#FF8C00]/08'
              : 'border-[#4FC3F7]/18 text-[#4FC3F7]/38 hover:text-[#4FC3F7]/65'
          }`}
        >
          ⬡ {selectedAgent && chatMode === 'private' ? `PRIVATE: ${selectedAgent.label}` : 'PRIVATE'}
        </button>

        {/* Toggle pill */}
        <div
          onClick={onToggleMode}
          className="relative w-10 h-5 rounded-full border border-[#00D4FF]/22 cursor-pointer overflow-hidden"
          style={{ background: 'rgba(0, 212, 255, 0.04)' }}
        >
          <motion.div
            animate={{ x: chatMode === 'broadcast' ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full"
            style={{ background: chatMode === 'broadcast' ? '#00D4FF' : '#FF8C00' }}
          />
        </div>

        <button
          onClick={onToggleMode}
          className={`text-[10px] tracking-[0.2em] px-3 py-1 rounded border transition-all ${
            chatMode === 'broadcast'
              ? 'border-[#00D4FF]/55 text-[#00D4FF] bg-[#00D4FF]/08'
              : 'border-[#4FC3F7]/18 text-[#4FC3F7]/38 hover:text-[#4FC3F7]/65'
          }`}
        >
          ⬡ BROADCAST ALL
        </button>

        {/* Right side indicators */}
        <div className="ml-auto flex items-center gap-3">
          {/* Thinking indicator */}
          <AnimatePresence>
            {thinking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-[9px] text-[#00D4FF] tracking-wider"
              >
                <div className="flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1 h-1 rounded-full bg-[#00D4FF] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                PROCESSING
              </motion.div>
            )}
          </AnimatePresence>
          <div className="text-[9px] text-[#4FC3F7]/28 tracking-wider">
            {messages.length} TRANSMISSIONS
          </div>
        </div>
      </div>

      {/* ── Message history ── */}
      <div
        ref={scrollRef}
        className="px-6 py-2 space-y-1 overflow-y-auto"
        style={{ maxHeight: '96px' }}
      >
        {messages.slice(-7).map(msg => {
          const isUser = msg.role === 'user'
          const targetLabel =
            msg.agentId === 'broadcast'
              ? 'ALL'
              : agents.find(a => a.id === msg.agentId)?.label ?? msg.agentId
          return (
            <div
              key={msg.id}
              className={`flex gap-2 text-[10px] leading-relaxed ${
                isUser ? 'text-[#e2e8f0]/78' : 'text-[#00D4FF]'
              }`}
            >
              <span
                className="shrink-0 text-[8px] tracking-wider"
                style={{
                  color: isUser ? 'rgba(255,140,0,0.7)' : 'rgba(79,195,247,0.6)',
                  width: '64px',
                }}
              >
                {isUser ? `YOU→${targetLabel}` : '◈'}
              </span>
              <span>{msg.text}</span>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-[#00D4FF]/05" />

      {/* ── Input row ── */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 px-6 py-3">
        <span className="text-[#FF8C00]/65 text-sm font-bold">›</span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-[#e2e8f0] text-xs placeholder:text-[#4FC3F7]/22 tracking-wide caret-[#FF8C00]"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="text-[10px] tracking-[0.22em] px-4 py-1.5 border border-[#FF8C00]/48 text-[#FF8C00] rounded hover:bg-[#FF8C00]/10 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
          TRANSMIT ▶
        </button>
      </form>
    </motion.div>
  )
}
