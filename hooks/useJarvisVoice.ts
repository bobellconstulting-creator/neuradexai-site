'use client'

/**
 * useJarvisVoice — complete voice loop for the Jarvis mobile UI.
 *
 * State machine:
 *   idle → listening → thinking → speaking → listening (alwaysOn) | idle
 *
 * STT:  MediaRecorder → POST /api/jarvis/transcribe (Groq Whisper)
 *       Works in ALL modern browsers including iOS Safari 14.3+.
 *
 * TTS:  POST /api/jarvis/speak/audio → MP3 bytes → AudioContext decode + play
 *       Fallback: window.speechSynthesis (browser built-in)
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface UseJarvisVoiceOptions {
  alwaysOn?: boolean
  onTranscript?: (text: string) => void
  onReply?: (text: string) => void
  onStateChange?: (state: VoiceState) => void
}

export interface UseJarvisVoiceResult {
  state: VoiceState
  transcript: string
  reply: string
  error: string | null
  /** Whether MediaRecorder is available in this browser. */
  supported: boolean
  toggleListening: () => void
  setAlwaysOn: (on: boolean) => void
  alwaysOn: boolean
  unlock: () => void
}

interface TelegramResponse {
  ok?: boolean
  reply?: string
  error?: string
}

interface TranscribeResponse {
  ok: boolean
  transcript?: string
  error?: string
}

function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)
}

export function useJarvisVoice(options: UseJarvisVoiceOptions = {}): UseJarvisVoiceResult {
  const { onTranscript, onReply, onStateChange } = options

  const [state, setStateRaw]        = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply]           = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [alwaysOn, setAlwaysOnState] = useState(options.alwaysOn ?? false)
  const [supported]                 = useState(isMediaRecorderSupported)

  const stateRef         = useRef<VoiceState>('idle')
  const alwaysOnRef      = useRef(options.alwaysOn ?? false)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const mediaStreamRef   = useRef<MediaStream | null>(null)
  const recorderRef      = useRef<MediaRecorder | null>(null)
  const onTranscriptRef  = useRef(onTranscript)
  const onReplyRef       = useRef(onReply)
  const onStateChangeRef = useRef(onStateChange)

  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])
  useEffect(() => { onReplyRef.current = onReply }, [onReply])
  useEffect(() => { onStateChangeRef.current = onStateChange }, [onStateChange])
  useEffect(() => { alwaysOnRef.current = alwaysOn }, [alwaysOn])

  useEffect(() => {
    return () => {
      stopRecording()
      releaseStream()
      const ctx = audioCtxRef.current
      if (ctx) { try { void ctx.close() } catch { /* ignore */ } }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setState = useCallback((next: VoiceState) => {
    stateRef.current = next
    setStateRaw(next)
    onStateChangeRef.current?.(next)
  }, [])

  function getAudioContext(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }

  function stopRecording() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { /* ignore */ }
    }
    recorderRef.current = null
  }

  function releaseStream() {
    const stream = mediaStreamRef.current
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
  }

  // ── speakFallback — browser synthesis ─────────────────────────────────────
  const speakFallback = useCallback((text: string, onDone: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { onDone(); return }
    const synth = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate  = 0.88
    utterance.pitch = 0.80

    const tryPickVoice = () => {
      const voices = synth.getVoices()
      const voice =
        voices.find(v => v.lang === 'en-GB' && /ryan|george|arthur/i.test(v.name)) ??
        voices.find(v => v.lang === 'en-GB') ??
        voices.find(v => v.lang.startsWith('en'))
      if (voice) utterance.voice = voice
    }
    tryPickVoice()
    if (synth.getVoices().length === 0) synth.addEventListener('voiceschanged', tryPickVoice, { once: true })

    utterance.onend   = () => onDone()
    utterance.onerror = () => onDone()
    if (synth.speaking || synth.pending) { try { synth.cancel() } catch { /* ignore */ } }
    synth.speak(utterance)
  }, [])

  // ── playAudio — decode MP3/WAV bytes via AudioContext ─────────────────────
  const playAudio = useCallback((bytes: ArrayBuffer, onDone: () => void) => {
    try {
      const ctx = getAudioContext()
      ctx.decodeAudioData(bytes, (buffer) => {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.onended = () => onDone()
        source.start(0)
      }, () => onDone())
    } catch { onDone() }
  }, [])

  // ── speakReply — Edge TTS → AudioContext → fallback synthesis ─────────────
  const speakReply = useCallback((text: string) => {
    setState('speaking')

    const handleDone = () => {
      if (alwaysOnRef.current) { setState('listening'); startListening() }
      else setState('idle')
    }

    fetch('/api/jarvis/speak/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(async (res) => {
        if (!res.ok) { speakFallback(text, handleDone); return }
        const buffer = await res.arrayBuffer()
        playAudio(buffer, handleDone)
      })
      .catch(() => speakFallback(text, handleDone))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState, speakFallback, playAudio])

  // ── handleTranscript — send to Jarvis, speak reply ────────────────────────
  const handleTranscript = useCallback((text: string) => {
    setTranscript(text)
    onTranscriptRef.current?.(text)
    setState('thinking')

    fetch('/api/jarvis/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(async (res) => {
        if (!res.ok) { setError(`HTTP ${res.status}`); setState('error'); return }
        const data = (await res.json()) as TelegramResponse
        const replyText = data.reply ?? ''
        if (!replyText) { setState(alwaysOnRef.current ? 'listening' : 'idle'); return }
        setReply(replyText)
        onReplyRef.current?.(replyText)
        speakReply(replyText)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setState('error')
      })
  }, [setState, speakReply])

  // ── startListening — MediaRecorder + Groq Whisper ─────────────────────────
  const startListening = useCallback(() => {
    if (stateRef.current === 'listening') return
    if (!isMediaRecorderSupported()) {
      setError('MediaRecorder not supported in this browser')
      setState('error')
      return
    }

    setState('listening')
    setError(null)

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream

        const mimeType =
          MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
          : ''

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
        recorderRef.current = recorder

        const chunks: Blob[] = []
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

        recorder.onstop = async () => {
          releaseStream()
          if (stateRef.current !== 'listening') return // cancelled
          if (chunks.length === 0) {
            if (alwaysOnRef.current) startListening()
            else setState('idle')
            return
          }

          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
          setState('thinking')

          const form = new FormData()
          form.append('audio', blob, 'recording.webm')

          try {
            const res = await fetch('/api/jarvis/transcribe', { method: 'POST', body: form })
            const data = (await res.json()) as TranscribeResponse
            if (data.ok && data.transcript) {
              handleTranscript(data.transcript)
            } else {
              // Nothing useful said — go back to listening
              if (alwaysOnRef.current) { setState('listening'); startListening() }
              else setState('idle')
            }
          } catch {
            if (alwaysOnRef.current) { setState('listening'); startListening() }
            else setState('idle')
          }
        }

        recorder.start()
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
          setError('not-allowed')
        } else {
          setError(msg)
        }
        setState('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState, handleTranscript])

  // ── stopListening — stop recorder, trigger transcription ──────────────────
  const stopListening = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state === 'recording') {
      rec.stop() // triggers onstop → transcription
    }
  }, [])

  // ── toggleListening ────────────────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    const current = stateRef.current
    if (current === 'thinking' || current === 'speaking') return

    if (current === 'idle' || current === 'error') {
      startListening()
    } else if (current === 'listening') {
      // Stop recording → sends audio to Whisper → Jarvis responds
      stopListening()
    }
  }, [startListening, stopListening])

  // ── setAlwaysOn ────────────────────────────────────────────────────────────
  const setAlwaysOn = useCallback((on: boolean) => {
    setAlwaysOnState(on)
    alwaysOnRef.current = on
    if (on && stateRef.current === 'idle') startListening()
    else if (!on && stateRef.current === 'listening') {
      stopRecording()
      releaseStream()
      setState('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening, setState])

  // ── unlock — iOS audio gate ────────────────────────────────────────────────
  const unlock = useCallback(() => {
    try {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') void ctx.resume()
    } catch { /* ignore */ }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        const primer = new SpeechSynthesisUtterance('')
        primer.volume = 0
        window.speechSynthesis.speak(primer)
      } catch { /* ignore */ }
    }
  }, [])

  return { state, transcript, reply, error, supported, toggleListening, setAlwaysOn, alwaysOn, unlock }
}
