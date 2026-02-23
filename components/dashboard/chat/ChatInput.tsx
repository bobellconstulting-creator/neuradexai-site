'use client'

import { useState, useRef } from 'react'
import type { AgentConfig } from '@/lib/agents'
import type { AgentStatus } from '@/components/providers/BridgeProvider'

interface ChatInputProps {
  agent:    AgentConfig
  status:   AgentStatus
  onSend:   (content: string) => void
  disabled?: boolean
}

export default function ChatInput({ agent, status, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isBusy = status === 'thinking' || status === 'responding'

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || isBusy || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }

  const statusLabel = isBusy
    ? status === 'thinking' ? `${agent.label} IS THINKING...` : `${agent.label} IS RESPONDING...`
    : `DIRECT LINE TO ${agent.label}`

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-neural-indigo-mid/20 p-4"
      style={{ background: 'rgba(5, 5, 10, 0.6)' }}
    >
      {/* Status label */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background:
              isBusy ? agent.color : 'rgba(148, 163, 184, 0.3)',
            boxShadow: isBusy ? `0 0 6px ${agent.color}` : 'none',
          }}
        />
        <span className="font-mono text-[9px] text-neural-muted/40 tracking-[0.2em]">
          {statusLabel}
        </span>
        <span className="ml-auto font-mono text-[9px] text-neural-muted/25 tracking-wider">
          SHIFT+ENTER for newline
        </span>
      </div>

      {/* Input row */}
      <div className="flex items-end gap-3">
        <div
          className="flex-1 rounded-xl border transition-all duration-200"
          style={{
            background:   'rgba(26, 10, 60, 0.3)',
            borderColor:  isBusy ? `${agent.color}30` : 'rgba(45, 27, 105, 0.3)',
            boxShadow:    isBusy ? `0 0 12px ${agent.color}10` : 'none',
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={isBusy ? '' : `Issue directive to ${agent.label}...`}
            className="w-full bg-transparent px-4 py-3 text-sm text-neural-text placeholder:text-neural-muted/25 outline-none resize-none font-mono leading-relaxed"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
        </div>

        <button
          type="submit"
          disabled={!value.trim() || isBusy || disabled}
          className="shrink-0 px-4 py-2.5 rounded-xl font-mono text-[11px] tracking-[0.2em] font-bold uppercase transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background:  value.trim() && !isBusy ? `${agent.color}15` : 'transparent',
            border:      `1px solid ${agent.color}40`,
            color:       agent.color,
            boxShadow:   value.trim() && !isBusy ? `0 0 16px ${agent.color}15` : 'none',
          }}
        >
          SEND ▶
        </button>
      </div>
    </form>
  )
}
