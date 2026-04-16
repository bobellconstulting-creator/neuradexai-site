'use client'

/**
 * VoiceChat — drop-in voice interface for Mission Control chat.
 *
 * Voice input:  Web Speech API (SpeechRecognition) — hold button to talk.
 * Voice output: SpeechSynthesis — auto-speaks Jarvis replies (British voice).
 *
 * Wires to /api/jarvis/telegram for the actual response.
 * Falls back gracefully if SpeechRecognition is not available.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface Message {
  id:      string
  role:    'bo' | 'jarvis'
  text:    string
  pending: boolean
}

interface VoiceChatProps {
  agentId?:    string
  agentColor?: string
  agentLabel?: string
  channel?:    string
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// Pick the best British voice from available SpeechSynthesis voices
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === 'en-GB' && v.localService) ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.name.toLowerCase().includes('british')) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  )
}

function speak(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice()
  if (voice) utterance.voice = voice
  utterance.rate  = 0.95
  utterance.pitch = 0.9
  window.speechSynthesis.speak(utterance)
}

export function VoiceChat({
  agentId    = 'jarvis',
  agentColor = '#00F2FF',
  agentLabel = 'JARVIS',
  channel    = 'mission-control',
}: VoiceChatProps) {
  const [messages, setMessages]   = useState<Message[]>([])
  const [draft,    setDraft]      = useState('')
  const [sending,  setSending]    = useState(false)
  const [ttsOn,    setTtsOn]      = useState(true)
  const [listening, setListening] = useState(false)
  const [hasSTT,   setHasSTT]     = useState(false)
  const scrollRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // Check STT availability
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    setHasSTT(!!SpeechRecognitionCtor)
  }, [])

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Load voices async (Chrome fires voiceschanged event)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.getVoices() // trigger load
    const handler = () => { window.speechSynthesis.getVoices() }
    window.speechSynthesis.addEventListener('voiceschanged', handler)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const boId = makeId()
    setMessages((prev) => [
      ...prev,
      { id: boId, role: 'bo', text: trimmed, pending: false },
    ])
    setDraft('')
    setSending(true)

    const pendingId = makeId()
    setMessages((prev) => [
      ...prev,
      { id: pendingId, role: 'jarvis', text: '', pending: true },
    ])

    try {
      const res = await fetch('/api/jarvis/telegram', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, chatId: channel }),
      })
      // Route returns NDJSON stream (keepalive \n lines then one JSON line).
      // Parse the last non-empty line as the actual response.
      const text = await res.text()
      const lastLine = text.split('\n').filter(l => l.trim()).pop() ?? ''
      let data: { ok: boolean; reply?: string; error?: string } = { ok: false }
      try { data = JSON.parse(lastLine) as typeof data } catch { /* fall through */ }
      const reply = data.ok && data.reply ? data.reply : (data.error ?? 'No response.')

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, text: reply, pending: false } : m,
        ),
      )
      if (ttsOn) speak(reply)
    } catch (e) {
      const errText = e instanceof Error ? e.message : 'Request failed.'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, text: errText, pending: false } : m,
        ),
      )
    } finally {
      setSending(false)
    }
  }, [sending, channel, ttsOn])

  const startListening = useCallback(() => {
    if (!hasSTT || listening) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const rec = new SpeechRecognitionCtor()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rec.lang            = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rec.interimResults  = false
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rec.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const transcript = (ev.results[0]?.[0]?.transcript ?? '') as string
      if (transcript.trim()) {
        void sendMessage(transcript.trim())
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rec.onerror = () => setListening(false)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    rec.onend   = () => setListening(false)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    recognitionRef.current = rec
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    rec.start()
    setListening(true)
  }, [hasSTT, listening, sendMessage])

  const stopListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(draft)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-3 space-y-2"
      >
        {messages.length === 0 && (
          <div className="mc-label text-center text-[var(--mc-text-mute)] py-10">
            HOLD MIC TO TALK · OR TYPE A MESSAGE
          </div>
        )}
        {messages.map((m) => {
          const isUser    = m.role === 'bo'
          const color     = isUser ? '#edf3ff' : agentColor
          const labelText = isUser ? 'BO' : agentLabel
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 px-2 py-1.5 rounded border ${
                isUser
                  ? 'border-[rgba(237,243,255,0.15)] bg-[rgba(237,243,255,0.03)]'
                  : 'border-transparent'
              }`}
            >
              <span
                className="mc-mono text-[10px] tracking-[0.22em] font-semibold shrink-0 w-14 pt-0.5"
                style={{ color }}
              >
                {labelText}
              </span>
              <div className="flex-1 min-w-0">
                {m.pending ? (
                  <span className="mc-mono text-[11px] text-[var(--mc-text-mute)] italic">
                    thinking…
                  </span>
                ) : (
                  <p className="text-[12px] text-sand mc-mono whitespace-pre-wrap break-words leading-relaxed">
                    {m.text}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--mc-border)] p-3 space-y-2">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${agentLabel}…`}
            rows={2}
            className="flex-1 resize-none bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-3 py-2 mc-mono text-[12px] text-sand placeholder:text-[var(--mc-text-mute)] focus:outline-none focus:border-[var(--mc-cyan)]"
          />
          <button
            onClick={() => void sendMessage(draft)}
            disabled={sending || !draft.trim()}
            className="mc-mono text-[11px] tracking-widest px-4 py-2 min-h-[44px] border border-[var(--mc-cyan)] text-[var(--mc-cyan)] rounded hover:bg-[rgba(0,212,255,0.10)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? 'WAIT' : 'SEND'}
          </button>
        </div>

        {/* Voice controls row */}
        <div className="flex items-center gap-3">
          {/* Hold-to-talk mic button */}
          {hasSTT && (
            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              className={`relative flex items-center justify-center w-14 h-14 rounded-full border-2 transition-all select-none touch-none ${
                listening
                  ? 'border-[#ff6060] bg-[rgba(255,96,96,0.15)] scale-105'
                  : 'border-[var(--mc-border)] bg-[rgba(0,212,255,0.05)] hover:border-[var(--mc-cyan)] hover:bg-[rgba(0,212,255,0.10)]'
              }`}
              aria-label="Hold to talk"
            >
              {/* Pulse ring while recording */}
              {listening && (
                <span className="absolute inset-0 rounded-full border-2 border-[#ff6060] animate-ping opacity-60" />
              )}
              <MicIcon listening={listening} />
            </button>
          )}
          <div className="flex flex-col leading-none">
            {hasSTT ? (
              <>
                <span className="mc-label text-[9px]">
                  {listening ? 'LISTENING…' : 'HOLD TO TALK'}
                </span>
                <span className="mc-label text-[8px] text-[var(--mc-text-mute)]">Web Speech API</span>
              </>
            ) : (
              <span className="mc-label text-[9px] text-[var(--mc-text-mute)]">
                STT UNAVAILABLE
              </span>
            )}
          </div>

          {/* TTS toggle */}
          <button
            onClick={() => {
              setTtsOn((v) => {
                if (v) window.speechSynthesis?.cancel()
                return !v
              })
            }}
            className={`ml-auto flex items-center gap-1.5 mc-mono text-[9px] tracking-widest px-2.5 py-1.5 border rounded transition-all ${
              ttsOn
                ? 'border-[var(--mc-cyan)] text-[var(--mc-cyan)] bg-[rgba(0,212,255,0.08)]'
                : 'border-[var(--mc-border)] text-[var(--mc-text-mute)]'
            }`}
            aria-label="Toggle voice output"
          >
            <SpeakerIcon on={ttsOn} />
            <span>{ttsOn ? 'VOICE ON' : 'VOICE OFF'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={listening ? '#ff6060' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--mc-cyan)]"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8"  y1="23" x2="16" y2="23" />
    </svg>
  )
}

function SpeakerIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}
