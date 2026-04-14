'use client'

/**
 * useSpeech — browser-native TTS + STT hook for Mission Control.
 *
 * Wraps `window.speechSynthesis` and `window.SpeechRecognition` so Bo
 * can hear agents speak (with distinct per-agent voices) and dictate
 * messages into the chat composer.
 *
 * Free as in beer: no external services, no API keys, no network. All
 * TTS/STT happens in the browser. Voice availability depends on the
 * host OS — Windows ships Zira/David/Mark, macOS ships Samantha/Alex,
 * Chrome adds Google US English Male/Female when online.
 *
 * Usage notes:
 *  - Browsers only allow `speechSynthesis.speak()` after a user gesture.
 *    Gate the first `speak()` call behind a button click.
 *  - `speechSynthesis.getVoices()` is often empty on first call and
 *    populates asynchronously — we listen for `voiceschanged`.
 *  - SpeechRecognition is prefixed on Chrome/Edge (`webkitSpeechRecognition`)
 *    and missing on Firefox. Always check `listeningSupported` first.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────

export interface SpeechVoicePref {
  nameHints: string[]
  rate:      number
  pitch:     number
  lang?:     string
}

export interface UseSpeechOptions {
  /** Called with the final transcript when speech recognition ends. */
  onTranscript?:     (text: string) => void
  /** Called whenever the listening state flips. */
  onListeningChange?: (listening: boolean) => void
}

export interface UseSpeechResult {
  /** Speak text with optional voice preferences. Cancels any in-progress speech first. */
  speak:              (text: string, pref?: SpeechVoicePref) => void
  /** Stop any in-progress speech. */
  stopSpeaking:       () => void
  /** Start listening. Resolves via `onTranscript` callback. */
  startListening:     () => void
  /** Stop listening manually. */
  stopListening:      () => void
  /**
   * Prime the browser TTS engine from inside a user gesture. iOS Safari and
   * some Chrome builds silently drop `speechSynthesis.speak()` calls that
   * originate outside a user gesture until the engine has been "unlocked"
   * by at least one gesture-rooted speak. Call this from a click handler
   * (e.g. the ♪ voice-toggle button) to enable background auto-speak.
   */
  unlockSpeech:       () => void
  /** Whether the browser supports speech synthesis. */
  speechSupported:    boolean
  /** Whether the browser supports speech recognition. */
  listeningSupported: boolean
  /** Whether currently speaking. */
  speaking:           boolean
  /** Whether currently listening. */
  listening:          boolean
}

// ─── Minimal SpeechRecognition shim ──────────────────────────────────────
// The DOM lib types for SpeechRecognition are still experimental and not
// shipped in lib.dom.d.ts for all TypeScript targets. Define just enough
// to type-check without pulling in @types/dom-speech-recognition.

interface SpeechRecognitionResultAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResultLike {
  isFinal:   boolean
  length:    number
  [index: number]: SpeechRecognitionResultAlternative
}

interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results:     SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionInstance {
  continuous:     boolean
  interimResults: boolean
  lang:           string
  start:          () => void
  stop:           () => void
  abort:          () => void
  onresult:       ((event: SpeechRecognitionEventLike) => void) | null
  onerror:        ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend:          (() => void) | null
  onstart:        (() => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance
}

interface WindowWithSpeech {
  SpeechRecognition?:       SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function getRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as WindowWithSpeech
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ─── Voice matching ──────────────────────────────────────────────────────

/**
 * Pick the best available voice given a preference chain. Iterates
 * `nameHints` in order and returns the first case-insensitive substring
 * match, optionally filtered by language prefix.
 */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  pref?:  SpeechVoicePref,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null
  if (!pref || pref.nameHints.length === 0) return null

  const langFilter = pref.lang?.toLowerCase()
  const pool = langFilter
    ? voices.filter((v) => v.lang.toLowerCase().startsWith(langFilter))
    : voices

  for (const hint of pref.nameHints) {
    const needle = hint.toLowerCase()
    const match = pool.find((v) => v.name.toLowerCase().includes(needle))
    if (match) return match
  }

  // If a language was requested but no hint matched, at least return a
  // voice in that language rather than falling back to the global default.
  if (langFilter && pool.length > 0) return pool[0]

  return null
}

// ─── The hook ────────────────────────────────────────────────────────────

export function useSpeech(options?: UseSpeechOptions): UseSpeechResult {
  const { onTranscript, onListeningChange } = options ?? {}

  const [speechSupported, setSpeechSupported]       = useState<boolean>(false)
  const [listeningSupported, setListeningSupported] = useState<boolean>(false)
  const [speaking, setSpeaking]                     = useState<boolean>(false)
  const [listening, setListening]                   = useState<boolean>(false)

  const voicesRef        = useRef<SpeechSynthesisVoice[]>([])
  const recognitionRef   = useRef<SpeechRecognitionInstance | null>(null)
  const utteranceRef     = useRef<SpeechSynthesisUtterance | null>(null)
  const onTranscriptRef  = useRef<UseSpeechOptions['onTranscript']>(onTranscript)
  const onListeningRef   = useRef<UseSpeechOptions['onListeningChange']>(onListeningChange)
  // iOS Safari / some Chromium builds gate speechSynthesis behind a user
  // gesture. Once we've successfully spoken at least once from a gesture,
  // the engine stays unlocked for the rest of the page lifetime.
  const speechUnlockedRef = useRef<boolean>(false)

  // Keep callback refs fresh without resubscribing the recognition listeners.
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])
  useEffect(() => {
    onListeningRef.current = onListeningChange
  }, [onListeningChange])

  // Feature detection + voice loading. Runs once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const ttsOk = typeof window.speechSynthesis !== 'undefined'
    setSpeechSupported(ttsOk)
    setListeningSupported(getRecognitionCtor() !== null)

    if (!ttsOk) return

    const loadVoices = (): void => {
      const v = window.speechSynthesis.getVoices()
      if (v.length > 0) voicesRef.current = v
    }

    loadVoices()
    // `voiceschanged` fires when the async voice list finishes loading.
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
      // Hard stop on unmount so nothing lingers between pages.
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore — some browsers throw if nothing is queued
      }
    }
  }, [])

  // Cleanup any active recognition on unmount.
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current
      if (rec) {
        try {
          rec.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }
  }, [])

  // Auto-prime the TTS engine on the first user gesture anywhere on the page.
  // iOS Safari (and some Chrome builds) silently drop `speechSynthesis.speak()`
  // calls that originate outside a user gesture until the engine has been
  // unlocked by at least one gesture-rooted speak. We attach a one-shot
  // pointerdown/keydown listener that fires a zero-volume utterance to unlock
  // the engine. After that, background auto-speak from `useEffect` works.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.speechSynthesis === 'undefined') return

    const unlock = (): void => {
      if (speechUnlockedRef.current) return
      try {
        const primer = new SpeechSynthesisUtterance('')
        primer.volume = 0
        primer.rate   = 1
        primer.pitch  = 1
        window.speechSynthesis.speak(primer)
        speechUnlockedRef.current = true
      } catch {
        // Engine rejected the primer — try again on the next gesture.
      }
    }

    const opts: AddEventListenerOptions = { once: false, passive: true }
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('keydown',     unlock, opts)
    window.addEventListener('touchstart',  unlock, opts)

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown',     unlock)
      window.removeEventListener('touchstart',  unlock)
    }
  }, [])

  const stopSpeaking = useCallback((): void => {
    if (typeof window === 'undefined') return
    if (typeof window.speechSynthesis === 'undefined') return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    utteranceRef.current = null
    setSpeaking(false)
  }, [])

  const speak = useCallback(
    (text: string, pref?: SpeechVoicePref): void => {
      if (typeof window === 'undefined') return
      if (typeof window.speechSynthesis === 'undefined') return
      const synth = window.speechSynthesis
      const trimmed = text.trim()
      if (trimmed.length === 0) return

      // If (and only if) something is actively speaking, cancel it so the
      // latest message wins. Calling `cancel()` unconditionally triggers a
      // known Chrome bug where the subsequent `speak()` is silently dropped
      // — so we gate it behind the active flag.
      if (synth.speaking || synth.pending) {
        try {
          synth.cancel()
        } catch {
          // ignore
        }
      }

      // Voices load asynchronously — refresh the cache in case the
      // `voiceschanged` event hasn't fired yet on first-time use.
      if (voicesRef.current.length === 0) {
        try {
          const v = synth.getVoices()
          if (v.length > 0) voicesRef.current = v
        } catch {
          // ignore
        }
      }

      const utter = new SpeechSynthesisUtterance(trimmed)
      const voice = pickVoice(voicesRef.current, pref)
      if (voice) utter.voice = voice
      if (pref?.lang) utter.lang = pref.lang
      utter.rate  = pref?.rate  ?? 1.0
      utter.pitch = pref?.pitch ?? 1.0
      utter.volume = 1.0

      utter.onstart = () => {
        speechUnlockedRef.current = true
        setSpeaking(true)
      }
      utter.onend   = () => {
        setSpeaking(false)
        if (utteranceRef.current === utter) utteranceRef.current = null
      }
      utter.onerror = () => {
        // `onerror` fires for 'canceled' and 'interrupted' too — we don't
        // want to surface those, just wind down state cleanly.
        setSpeaking(false)
        if (utteranceRef.current === utter) utteranceRef.current = null
      }

      utteranceRef.current = utter
      try {
        synth.speak(utter)
      } catch {
        setSpeaking(false)
        utteranceRef.current = null
      }
    },
    [],
  )

  const unlockSpeech = useCallback((): void => {
    if (typeof window === 'undefined') return
    if (typeof window.speechSynthesis === 'undefined') return
    if (speechUnlockedRef.current) return
    try {
      const primer = new SpeechSynthesisUtterance('')
      primer.volume = 0
      window.speechSynthesis.speak(primer)
      speechUnlockedRef.current = true
    } catch {
      // ignore — another gesture will retry
    }
  }, [])

  const stopListening = useCallback((): void => {
    const rec = recognitionRef.current
    if (!rec) return
    try {
      rec.stop()
    } catch {
      // ignore
    }
  }, [])

  const startListening = useCallback((): void => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return

    // If already listening, treat this as a toggle-off.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
      return
    }

    const rec = new Ctor()
    rec.continuous     = false
    rec.interimResults = false
    rec.lang           = 'en-US'

    rec.onstart = () => {
      setListening(true)
      onListeningRef.current?.(true)
    }

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal && result.length > 0) {
          transcript += result[0].transcript
        }
      }
      const clean = transcript.trim()
      if (clean.length > 0) {
        onTranscriptRef.current?.(clean)
      }
    }

    rec.onerror = () => {
      // Browser fires errors for "no-speech", "aborted", etc. We don't
      // want to surface these — just wind down cleanly.
      setListening(false)
      onListeningRef.current?.(false)
      recognitionRef.current = null
    }

    rec.onend = () => {
      setListening(false)
      onListeningRef.current?.(false)
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch {
      // `start()` throws if called while already started. Treat as no-op.
      setListening(false)
      recognitionRef.current = null
    }
  }, [])

  return {
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    unlockSpeech,
    speechSupported,
    listeningSupported,
    speaking,
    listening,
  }
}
