'use client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognition = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionEvent = any

import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { JarvisAgent, JarvisMessage } from './jarvisData'
import type { AgentState } from '@/hooks/useJarvisWS'

export type { AgentState }

const STATE_LABEL: Record<AgentState, string> = {
  idle:             'STANDBY',
  thinking:         'PROCESSING',
  acting:           'EXECUTING TOOL',
  waiting_approval: 'NEEDS YOUR OK',
  speaking:         'RESPONDING',
  offline:          'OFFLINE',
}

const STATE_COLOR: Record<AgentState, string> = {
  idle:             '#00D4FF',
  thinking:         '#FF8C00',
  acting:           '#FF8C00',
  waiting_approval: '#FF3B30',
  speaking:         '#00D4FF',
  offline:          '#FF3B30',
}

interface JarvisChatProps {
  agents: JarvisAgent[]
  selectedAgent: JarvisAgent | null
  chatMode: 'private' | 'broadcast'
  messages: JarvisMessage[]
  onSend: (text: string) => void
  onToggleMode: () => void
  agentState?: AgentState
  onAudioLevel?: (level: number) => void
  onSpeakingChange?: (speaking: boolean) => void
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
async function speakElevenLabs(
  text: string,
  onLevel: (v: number) => void,
  onDone: () => void,
  onStart: () => void,
) {
  const clean = text.replace(/[*_`#>\[\]]/g, '').replace(/⚠/g, 'Warning:').slice(0, 500)
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean }),
    })
    if (!res.ok) throw new Error(await res.text())
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const audio = new Audio(url)

    // Web Audio analyser for real-time amplitude → 3D reactor
    const ctx      = new AudioContext()
    const src      = ctx.createMediaElementSource(audio)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    analyser.connect(ctx.destination)
    const buf = new Uint8Array(analyser.frequencyBinCount)

    let raf = 0
    function tick() {
      analyser.getByteFrequencyData(buf)
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length / 255
      onLevel(avg)
      raf = requestAnimationFrame(tick)
    }

    audio.onplay  = () => { onStart(); tick() }
    audio.onended = () => {
      cancelAnimationFrame(raf)
      onLevel(0)
      onDone()
      URL.revokeObjectURL(url)
      ctx.close()
    }
    audio.play()
  } catch {
    // ElevenLabs failed — fallback to Web Speech
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(clean)
      const voices = window.speechSynthesis.getVoices()
      const v = voices.find(v => v.lang === 'en-GB') ?? null
      if (v) utt.voice = v
      utt.rate = 1.05; utt.pitch = 0.9
      utt.onstart = onStart
      utt.onend = () => { onLevel(0); onDone() }
      window.speechSynthesis.speak(utt)
    } else {
      onDone()
    }
  }
}

export default function JarvisChat({
  agents,
  selectedAgent,
  chatMode,
  messages,
  onSend,
  onToggleMode,
  agentState = 'idle',
  onAudioLevel,
  onSpeakingChange,
}: JarvisChatProps) {
  const [input, setInput]           = useState('')
  const [voiceOutput, setVoiceOutput] = useState(true)
  const [listening, setListening]   = useState(false)
  const [wakeActive, setWakeActive] = useState(false)
  const scrollRef                   = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRef                     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef                      = useRef<any>(null)
  const lastSpokenId                = useRef('')
  const isSpeakingRef               = useRef(false)

  const thinking = agentState === 'thinking' || agentState === 'acting'
  const needsApproval = agentState === 'waiting_approval'
  const stateColor = STATE_COLOR[agentState] ?? '#00D4FF'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Auto-speak new Jarvis responses via ElevenLabs
  useEffect(() => {
    if (!voiceOutput) return
    const last = [...messages].reverse().find(m =>
      m.role === 'agent' && !m.text.endsWith('▌') && !m.id.includes('streaming')
    )
    if (!last || last.id === lastSpokenId.current) return
    lastSpokenId.current = last.id
    if (isSpeakingRef.current) window.speechSynthesis?.cancel()
    speakElevenLabs(
      last.text,
      (v) => onAudioLevel?.(v),
      () => { isSpeakingRef.current = false; onSpeakingChange?.(false) },
      () => { isSpeakingRef.current = true; onSpeakingChange?.(true) },
    )
  }, [messages, voiceOutput])

  // ── Wake word — persistent, never times out ───────────────────────────────
  const startWake = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return
    const w = new SR() as SpeechRecognition
    w.continuous = true
    w.interimResults = true   // interim so we catch partial "jarvis" faster
    w.lang = 'en-US'
    w.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript.toLowerCase()).join(' ')
      if (transcript.includes('jarvis') && !listening) {
        startListening()
      }
    }
    w.onerror = () => { /* silently ignore — auto-restarts */ }
    w.onend = () => {
      if (wakeRef.current === w) {
        setTimeout(() => { try { w.start() } catch { /* ignore */ } }, 300)
      }
    }
    wakeRef.current = w
    try { w.start(); setWakeActive(true) } catch { /* browser blocked */ }
  }, [listening])

  const stopWake = useCallback(() => {
    const w = wakeRef.current
    wakeRef.current = null
    try { w?.abort() } catch { /* ignore */ }
    setWakeActive(false)
  }, [])

  // ── Voice listening — captures full command, no premature timeout ─────────
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR || listening) return
    setListening(true)

    // Say "Yes?" via Web Speech (fast, no network) then start mic after it finishes
    const ack = new SpeechSynthesisUtterance('Yes?')
    ack.rate = 1.15; ack.pitch = 0.85; ack.volume = 0.55
    const voices = window.speechSynthesis?.getVoices() ?? []
    const v = voices.find(v => v.lang === 'en-GB') ?? null
    if (v) ack.voice = v
    ack.onend = () => {
      const rec = new SR() as SpeechRecognition
      rec.continuous = false
      rec.interimResults = false
      rec.lang = 'en-US'
      rec.maxAlternatives = 1
      rec.onend = () => { setListening(false); recRef.current = null }
      rec.onresult = (e: SpeechRecognitionEvent) => {
        const text = e.results[0]?.[0]?.transcript?.trim()
        if (text) {
          window.speechSynthesis?.cancel()
          isSpeakingRef.current = false
          onAudioLevel?.(0)
          onSpeakingChange?.(false)
          setInput(text)
          setTimeout(() => { onSend(text); setInput('') }, 100)
        } else {
          setListening(false)
        }
      }
      recRef.current = rec
      try { rec.start() } catch { setListening(false) }
    }
    window.speechSynthesis?.cancel()
    window.speechSynthesis?.speak(ack)
  }, [listening, onSend, onAudioLevel, onSpeakingChange])

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    window.speechSynthesis?.cancel()
    isSpeakingRef.current = false
    onAudioLevel?.(0)
    onSpeakingChange?.(false)
    onSend(text)
    setInput('')
  }

  const placeholder = chatMode === 'private' && selectedAgent
    ? `Command ${selectedAgent.label}...`
    : wakeActive ? 'Say "Jarvis" to activate or type here...' : 'Give JARVIS a command...'

  return (
    <motion.div
      initial={{ y: 200, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-0 left-0 right-0 z-20 font-mono"
      style={{
        background:     'rgba(0, 4, 14, 0.97)',
        borderTop:      `1px solid ${stateColor}50`,
        backdropFilter: 'blur(24px)',
        boxShadow:      `0 -6px 48px ${stateColor}20`,
        transition:     'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg,transparent,${stateColor}70,transparent)` }} />

      {/* Status bar */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-white/[0.04]">
        <motion.div
          animate={thinking || needsApproval ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: needsApproval ? 0.5 : 0.9, ease: 'easeInOut' }}
          className="w-2 h-2 rounded-full"
          style={{ background: stateColor, boxShadow: `0 0 8px ${stateColor}` }}
        />
        <span className="text-[10px] tracking-[0.22em] font-semibold" style={{ color: stateColor }}>
          {needsApproval ? '⚠ ACTION REQUIRES APPROVAL — SEE ABOVE' : STATE_LABEL[agentState]}
        </span>

        <div className="w-px h-3 bg-white/10 mx-1" />
        <button onClick={onToggleMode} className={`text-[9px] tracking-[0.15em] px-2 py-0.5 rounded border transition-all ${
          chatMode === 'private' ? 'border-[#FF8C00]/50 text-[#FF8C00]' : 'border-[#00D4FF]/20 text-[#00D4FF]/40 hover:text-[#00D4FF]/70'
        }`}>
          {chatMode === 'private' && selectedAgent ? `⬡ ${selectedAgent.label}` : '⬡ BROADCAST'}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => wakeActive ? stopWake() : startWake()} className={`text-[9px] px-2 py-0.5 rounded border transition-all ${
            wakeActive ? 'border-emerald-400/60 text-emerald-400 bg-emerald-400/10' : 'border-white/10 text-white/25 hover:text-white/50'
          }`}>
            {wakeActive ? '👂 WAKE ON' : '👁 WAKE'}
          </button>
          <button onClick={() => { setVoiceOutput(v => !v); window.speechSynthesis?.cancel(); onAudioLevel?.(0); onSpeakingChange?.(false) }}
            className={`text-[9px] px-2 py-0.5 rounded border transition-all ${voiceOutput ? 'border-[#00D4FF]/40 text-[#00D4FF]/70' : 'border-white/10 text-white/25'}`}>
            {voiceOutput ? '🔊' : '🔇'}
          </button>
          <span className="text-[9px] text-white/20">{messages.length} TX</span>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="px-5 py-3 space-y-2 overflow-y-auto" style={{ maxHeight: '300px', minHeight: '100px' }}>
        <AnimatePresence initial={false}>
          {messages.slice(-25).map(msg => {
            const isUser = msg.role === 'user'
            const isStreaming = msg.id === 'streaming'
            const isError = msg.text.startsWith('⚠')
            const label = msg.agentId === 'broadcast' ? 'ALL' : agents.find(a => a.id === msg.agentId)?.label ?? msg.agentId

            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="shrink-0 w-5 h-5 mt-0.5 rounded border border-[#00D4FF]/30 bg-[#00D4FF]/05 flex items-center justify-center">
                    <span className="text-[8px] text-[#00D4FF]/60">J</span>
                  </div>
                )}
                <div className={`max-w-[78%] px-3 py-2 rounded text-[11px] leading-relaxed ${
                  isUser ? 'bg-[#FF8C00]/08 border border-[#FF8C00]/20 text-[#e2e8f0]'
                  : isError ? 'bg-red-500/08 border border-red-500/20 text-red-300'
                  : isStreaming ? 'bg-[#00D4FF]/05 border border-[#00D4FF]/25 text-[#00D4FF]'
                  : 'bg-[#00D4FF]/04 border border-[#00D4FF]/10 text-[#c8e8f8]'
                }`}>
                  <div className="text-[8px] tracking-wider mb-1 opacity-50">
                    {isUser ? `YOU → ${label}` : isStreaming ? 'JARVIS ▍' : 'JARVIS'}
                  </div>
                  <span className="whitespace-pre-wrap">{msg.text}</span>
                </div>
                {isUser && (
                  <div className="shrink-0 w-5 h-5 mt-0.5 rounded border border-[#FF8C00]/30 bg-[#FF8C00]/05 flex items-center justify-center">
                    <span className="text-[8px] text-[#FF8C00]/60">B</span>
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        <AnimatePresence>
          {thinking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-end gap-1 pl-7">
              {[0,1,2,3,4].map(i => (
                <motion.div key={i} animate={{ scaleY: [0.3,1,0.3] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                  className="w-0.5 rounded-full" style={{ height: 14, background: stateColor }} />
              ))}
              <span className="text-[9px] ml-2 tracking-widest" style={{ color: stateColor }}>
                {STATE_LABEL[agentState]}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-5 h-px bg-white/[0.04]" />

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 px-5 py-3">
        <motion.button type="button" onClick={listening ? () => recRef.current?.stop() : startListening}
          whileTap={{ scale: 0.88 }}
          animate={listening ? { scale: [1, 1.12, 1], boxShadow: ['0 0 8px #00D4FF60', '0 0 18px #00D4FFaa', '0 0 8px #00D4FF60'] } : {}}
          transition={{ repeat: Infinity, duration: 0.8 }}
          className="shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all"
          style={{ borderColor: listening ? '#00D4FF' : 'rgba(0,212,255,0.2)', background: listening ? 'rgba(0,212,255,0.12)' : 'transparent' }}>
          <span className="text-base">{listening ? '🔴' : '🎤'}</span>
        </motion.button>

        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-[#e2e8f0] text-sm placeholder:text-[#4FC3F7]/20 tracking-wide caret-[#00D4FF]"
          autoComplete="off" spellCheck={false} />

        <motion.button type="submit" disabled={!input.trim()}
          whileHover={input.trim() ? { scale: 1.04 } : {}}
          whileTap={input.trim() ? { scale: 0.96 } : {}}
          className="shrink-0 px-5 py-2 rounded text-[11px] tracking-[0.2em] font-bold transition-all disabled:opacity-15 disabled:cursor-not-allowed"
          style={{
            background: input.trim() ? 'rgba(0,212,255,0.12)' : 'transparent',
            border: `1.5px solid ${input.trim() ? '#00D4FF' : 'rgba(0,212,255,0.15)'}`,
            color: input.trim() ? '#00D4FF' : 'rgba(0,212,255,0.25)',
            boxShadow: input.trim() ? '0 0 20px rgba(0,212,255,0.35), inset 0 0 10px rgba(0,212,255,0.06)' : 'none',
          }}>
          TRANSMIT ▶
        </motion.button>
      </form>
    </motion.div>
  )
}
