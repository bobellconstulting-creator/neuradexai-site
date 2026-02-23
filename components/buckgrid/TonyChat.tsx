'use client'

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import html2canvas from 'html2canvas'

export type TonyChatHandle = {
  addTonyMessage: (text: string) => void
  triggerScan: (prompt: string) => void
}

type Message = { role: 'tony' | 'user'; text: string }

const TonyChat = forwardRef<TonyChatHandle, { getCaptureTarget: () => HTMLElement | null }>(
  ({ getCaptureTarget }, ref) => {
    const [chat, setChat] = useState<Message[]>([
      { role: 'tony', text: "Ready. Lock the border and let's start the audit." },
    ])
    const [input, setInput] = useState('')
    const [isOpen, setIsOpen] = useState(true)
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, [chat])

    useImperativeHandle(ref, () => ({
      addTonyMessage: (text: string) => setChat(p => [...p, { role: 'tony', text }]),
      triggerScan: async (contextPrompt: string) => {
        if (loading) return
        setLoading(true)
        setChat(p => [...p, { role: 'tony', text: 'Analyzing terrain & cover...' }])
        try {
          const target = getCaptureTarget()
          if (!target) throw new Error('No map found')
          const canvas = await html2canvas(target, { useCORS: true, scale: 1 })
          const imageDataUrl = canvas.toDataURL('image/jpeg', 0.6)
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: contextPrompt, imageDataUrl }),
          })
          const data = await res.json()
          setChat(p => {
            const next = [...p]
            next.pop() // remove "Analyzing..."
            next.push({ role: 'tony', text: data.reply || 'Connection error.' })
            return next
          })
        } catch {
          setChat(p => [...p, { role: 'tony', text: "I couldn't get a clear visual. Try again." }])
        }
        setLoading(false)
      },
    }), [loading, getCaptureTarget])

    const send = async () => {
      if (!input.trim() || loading) return
      const msg = input.trim()
      setLoading(true)
      setInput('')
      setChat(p => [...p, { role: 'user', text: msg }])
      try {
        const target = getCaptureTarget()
        const canvas = target ? await html2canvas(target, { useCORS: true, scale: 1 }) : null
        const imageDataUrl = canvas?.toDataURL('image/jpeg', 0.6)
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, imageDataUrl }),
        })
        const data = await res.json()
        setChat(p => [...p, { role: 'tony', text: data.reply || 'No reply.' }])
      } catch {
        setChat(p => [...p, { role: 'tony', text: 'Capture failed.' }])
      }
      setLoading(false)
    }

    return (
      <div
        className="glass"
        style={{
          position: 'absolute',
          right: 10,
          top: 10,
          width: isOpen ? 310 : 52,
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          transition: 'width 0.25s ease',
          zIndex: 2000,
        }}
      >
        {/* Header */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '11px 14px',
            background: '#1a1a1a',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 900,
            fontSize: 10,
            color: '#FF6B00',
            letterSpacing: '0.12em',
            flexShrink: 0,
          }}
        >
          <span>{isOpen ? 'TONY PARTNER' : '🦌'}</span>
          {isOpen && <span style={{ color: '#555' }}>—</span>}
        </div>

        {isOpen && (
          <>
            {/* Messages */}
            <div
              ref={scrollRef}
              style={{
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 10,
                minHeight: 120,
                maxHeight: 380,
              }}
            >
              {chat.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    background: m.role === 'user' ? '#FF6B00' : '#2a2a2a',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    maxWidth: '88%',
                    lineHeight: 1.5,
                  }}
                >
                  {m.text}
                </div>
              ))}
              {loading && (
                <div style={{ alignSelf: 'flex-start', color: '#555', fontSize: 10, paddingLeft: 4 }}>
                  Tony is looking...
                </div>
              )}
            </div>

            {/* Input */}
            <div
              style={{
                padding: '8px 10px',
                display: 'flex',
                gap: 6,
                background: '#111',
                flexShrink: 0,
              }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask Tony..."
                style={{
                  flex: 1,
                  background: '#222',
                  border: '1px solid #333',
                  color: '#fff',
                  padding: '7px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                onClick={send}
                disabled={loading}
                style={{
                  background: '#FF6B00',
                  border: 'none',
                  borderRadius: 6,
                  cursor: loading ? 'wait' : 'pointer',
                  color: '#000',
                  fontWeight: 'bold',
                  padding: '0 12px',
                  fontSize: 13,
                }}
              >
                ➤
              </button>
            </div>
          </>
        )}
      </div>
    )
  }
)

TonyChat.displayName = 'TonyChat'
export default React.memo(TonyChat)
