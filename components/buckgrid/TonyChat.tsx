'use client'

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import html2canvas from 'html2canvas'

export type TonyChatHandle = {
  addTonyMessage: (text: string) => void
  triggerScan: (prompt: string) => void
}

type Message = { role: 'tony' | 'user'; text: string }

type SpatialContext = {
  acreage: number
  boundaryGeoJSON: any | null
  mapBounds: { sw: [number, number]; ne: [number, number] } | null
  layers: any[]
  locationLabel?: string
}

const TonyChat = forwardRef<TonyChatHandle, {
  getCaptureTarget: () => HTMLElement | null
  getSpatialContext: () => SpatialContext
}>(
  ({ getCaptureTarget, getSpatialContext }, ref) => {
    const [chat, setChat] = useState<Message[]>([
      { role: 'tony', text: "Ready. Lock the border, paint what matters, and I'll turn the property into a hunt plan." },
    ])
    const [input, setInput] = useState('')
    const [isOpen, setIsOpen] = useState(true)
    const [loading, setLoading] = useState(false)
    const [viewportWidth, setViewportWidth] = useState(1600)
    const scrollRef = useRef<HTMLDivElement>(null)
    const quickPrompts = [
      'Best early-season stand?',
      'Where should the sanctuary go?',
      'What should I build this week?',
    ]

    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, [chat])

    useEffect(() => {
      const syncViewport = () => setViewportWidth(window.innerWidth)
      syncViewport()
      window.addEventListener('resize', syncViewport)
      return () => window.removeEventListener('resize', syncViewport)
    }, [])

    const isMobile = viewportWidth < 960

    const askTony = async (prompt: string) => {
      const target = getCaptureTarget()
      const spatial = getSpatialContext()
      const canvas = target ? await html2canvas(target, { useCORS: true, scale: 1 }) : null
      const imageBase64 = canvas?.toDataURL('image/png').replace('data:image/png;base64,', '')

      if (spatial.boundaryGeoJSON && spatial.mapBounds) {
        const res = await fetch('/api/tony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64,
            boundaryGeoJSON: spatial.boundaryGeoJSON,
            mapBounds: spatial.mapBounds,
            acreage: spatial.acreage,
            region: spatial.locationLabel || 'Unknown region',
            state: spatial.locationLabel || 'Unknown state',
            messages: [{ role: 'user', content: `${prompt}\n\nVisible drawn layers: ${JSON.stringify(spatial.layers)}` }],
            stream: false,
          }),
        })
        if (res.ok) {
          return res.json()
        }
      }

      const fallbackRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, imageDataUrl: canvas?.toDataURL('image/jpeg', 0.6) }),
      })
      return fallbackRes.json()
    }

    const runPrompt = async (prompt: string) => {
      if (!prompt.trim() || loading) return

      setLoading(true)
      setChat(p => [...p, { role: 'user', text: prompt }])

      try {
        const data = await askTony(prompt)
        setChat(p => [...p, { role: 'tony', text: data.reply || 'No reply.' }])
      } catch {
        setChat(p => [...p, { role: 'tony', text: "I'm up, but the live model path failed. Ask again after locking the property or use one of the quick prompts." }])
      }

      setLoading(false)
    }

    useImperativeHandle(ref, () => ({
      addTonyMessage: (text: string) => setChat(p => [...p, { role: 'tony', text }]),
      triggerScan: async (contextPrompt: string) => {
        if (loading) return
        setLoading(true)
        setChat(p => [...p, { role: 'tony', text: 'Analyzing terrain & cover...' }])
        try {
          const data = await askTony(contextPrompt)
          setChat(p => {
            const next = [...p]
            next.pop() // remove "Analyzing..."
            next.push({ role: 'tony', text: data.reply || 'Connection error.' })
            return next
          })
        } catch {
          setChat(p => [...p, { role: 'tony', text: "The live vision lane missed, but the property is still locked. Ask for one move at a time and I'll give you the best non-visual guidance I can." }])
        }
        setLoading(false)
      },
    }), [loading, getCaptureTarget, getSpatialContext])

    const send = async () => {
      const msg = input.trim()
      setInput('')
      await runPrompt(msg)
    }

    return (
      <div
        className="glass"
        style={{
          position: 'absolute',
          right: 12,
          top: isMobile ? 'auto' : 12,
          bottom: isMobile ? 12 : 'auto',
          width: isOpen ? (isMobile ? 'calc(100vw - 24px)' : 'min(320px, calc(100vw - 24px))') : 54,
          borderRadius: 24,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 24px)',
          transition: 'width 0.25s ease',
          zIndex: 2000,
          background: 'linear-gradient(180deg, rgba(18,22,18,0.97) 0%, rgba(10,14,11,0.96) 100%)',
          border: '1px solid rgba(220,188,117,0.18)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.38)',
        }}
      >
        {/* Header */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '16px 18px 14px',
            background: 'linear-gradient(180deg, rgba(30,36,28,0.96) 0%, rgba(15,18,15,0.96) 100%)',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 900,
            fontSize: 10,
            color: '#d9a441',
            letterSpacing: '0.18em',
            flexShrink: 0,
            textTransform: 'uppercase',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span>{isOpen ? 'Tony Habitat Partner' : '🦌'}</span>
          {isOpen && <span style={{ color: 'rgba(237,227,197,0.4)' }}>collapse</span>}
        </div>

        {isOpen && (
          <>
            <div style={{ padding: '14px 16px 12px', background: 'rgba(217,164,65,0.06)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ color: '#f7f0de', fontSize: 17, fontWeight: 700, lineHeight: 1.15, marginBottom: 6 }}>
                Premium deer-ground intelligence.
              </div>
              <div style={{ color: 'rgba(237,227,197,0.72)', fontSize: 12, lineHeight: 1.55 }}>
                Ask Tony for the next best move, best stand, sanctuary location, or build order after you sketch the property.
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              style={{
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 14,
                minHeight: 160,
                maxHeight: 420,
                background: 'radial-gradient(circle at top, rgba(217,164,65,0.08), transparent 45%)',
              }}
            >
              {chat.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    background: m.role === 'user'
                      ? 'linear-gradient(135deg, #d9a441 0%, #f2cd7a 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(18,22,18,0.92) 100%)',
                    color: m.role === 'user' ? '#17150f' : '#f7f0de',
                    padding: '10px 13px',
                    borderRadius: 16,
                    fontSize: 12,
                    maxWidth: '90%',
                    lineHeight: 1.65,
                    border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {m.text}
                </div>
              ))}
              {loading && (
                <div style={{ alignSelf: 'flex-start', color: 'rgba(237,227,197,0.54)', fontSize: 10, paddingLeft: 4, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Tony is reading the property...
                </div>
              )}
            </div>

            <div style={{ padding: '0 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => runPrompt(prompt)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#d9ddcf',
                    borderRadius: 999,
                    padding: '7px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input */}
            <div
              style={{
                padding: '10px 12px 12px',
                display: 'flex',
                gap: 8,
                background: 'rgba(12,15,12,0.98)',
                flexShrink: 0,
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask Tony where to hunt, build, or improve..."
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff8e9',
                  padding: '11px 13px',
                  borderRadius: 14,
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                onClick={send}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #d9a441 0%, #f2cd7a 100%)',
                  border: 'none',
                  borderRadius: 14,
                  cursor: loading ? 'wait' : 'pointer',
                  color: '#17150f',
                  fontWeight: 'bold',
                  padding: '0 14px',
                  fontSize: 13,
                  boxShadow: '0 12px 28px rgba(217,164,65,0.24)',
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
