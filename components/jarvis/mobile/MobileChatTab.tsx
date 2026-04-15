'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

export default function MobileChatTab() {
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [input, setInput]         = useState('')
  const [thinking, setThinking]   = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLTextAreaElement>(null)

  // Build history for the API from local state
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || thinking) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }]
    setInput('')
    setThinking(true)

    try {
      const res = await fetch('/api/jarvis/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyRef.current.slice(-20),
          chatId: 'mobile-chat',
        }),
      })

      const data = (await res.json()) as { ok: boolean; reply?: string; error?: string }

      if (data.ok && data.reply) {
        const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply, ts: Date.now() }
        setMessages(prev => [...prev, assistantMsg])
        historyRef.current = [...historyRef.current, { role: 'assistant', content: data.reply! }]
      } else {
        const errMsg: ChatMessage = {
          role: 'assistant',
          content: data.error ?? 'No response.',
          ts: Date.now(),
        }
        setMessages(prev => [...prev, errMsg])
      }
    } catch (e) {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Request failed.',
        ts: Date.now(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setThinking(false)
    }
  }, [thinking])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center pt-12">
            <p className="font-mono text-[11px] tracking-widest text-white/20 uppercase">
              Say anything, sir.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[82%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#00D4FF]/15 text-white border border-[#00D4FF]/20'
                  : 'bg-white/5 text-white/80 border border-white/10'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <span className="font-mono text-[11px] tracking-widest text-[#00D4FF]/60 animate-pulse">
                thinking…
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        className="flex-none flex items-end gap-2 px-3 py-3 border-t border-white/5"
        style={{ background: 'rgba(0,8,16,0.98)' }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Jarvis…"
          rows={1}
          disabled={thinking}
          className="flex-1 resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#00D4FF]/40 disabled:opacity-50 leading-tight"
          style={{ maxHeight: 120, overflowY: 'auto' }}
        />
        <button
          onClick={() => void send(input)}
          disabled={!input.trim() || thinking}
          className="flex-none w-10 h-10 flex items-center justify-center rounded-xl border border-[#00D4FF]/30 text-[#00D4FF] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#00D4FF]/10 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
