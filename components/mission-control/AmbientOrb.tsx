'use client'

/**
 * AmbientOrb — permanent ambient 3D orb for the lobby.
 *
 * Mounts AgentOrbScene (lazy, ssr:false) and optionally activates
 * microphone audio reactivity on tap. Handles permission denial gracefully.
 * Cleans up all AudioContext resources on unmount.
 *
 * Audio loop is skipped when prefers-reduced-motion is active.
 */

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'

// Lazy-load the R3F canvas — prevents SSR crash
const AgentOrbScene = dynamic(
  () => import('./AgentOrbScene'),
  { ssr: false }
)

// Bo's 4 agent colors — Doc/cyan, Linda/green, Marcus/gold, Vault/magenta
const DEFAULT_COLORS: [string, string, string, string] = [
  '#00d4ff', // Doc   — cyan
  '#00ff88', // Linda — emerald
  '#f0c040', // Marcus — gold
  '#e040fb', // Vault  — magenta
]

type AudioState = 'idle' | 'listening' | 'denied'

interface AmbientOrbProps {
  colors?: string[]
  height?: number
  className?: string
}

export function AmbientOrb({
  colors,
  height = 240,
  className = '',
}: AmbientOrbProps) {
  const [audioState, setAudioState] = useState<AudioState>('idle')
  const [audioLevel, setAudioLevel] = useState(0)

  // Audio resource refs — all cleaned up on unmount
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const analyserRef    = useRef<AnalyserNode | null>(null)
  const sourceRef      = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const rafRef         = useRef<number | null>(null)
  // iOS Safari is most compatible with the Uint8Array time-domain path.
  // Explicit ArrayBuffer generic for TS 5.7+ strict generic typed arrays.
  const bufferRef      = useRef<Uint8Array<ArrayBuffer> | null>(null)
  // Throttle setState to ~30 fps
  const lastUpdateRef  = useRef(0)

  // Respect prefers-reduced-motion — skip audio loop entirely
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )

  const stopAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    sourceRef.current?.disconnect()
    analyserRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close()
    }
    audioCtxRef.current = null
    analyserRef.current = null
    sourceRef.current   = null
    streamRef.current   = null
    bufferRef.current   = null
    setAudioLevel(0)
  }, [])

  // RAF loop — reads time-domain samples, computes RMS, normalizes to 0-1.
  // Uses the byte (Uint8Array) path for maximum iOS Safari compatibility —
  // getFloatTimeDomainData had bugs on several iOS versions. Byte samples
  // are 0..255 centered on 128, so we center and rescale to -1..1.
  const startLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    if (!bufferRef.current) {
      // Construct from an explicit ArrayBuffer so the type resolves to
      // Uint8Array<ArrayBuffer> (strict under TS 5.7+ generic arrays).
      bufferRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize))
    }
    const buf = bufferRef.current

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick)

      try {
        analyser.getByteTimeDomainData(buf)
      } catch {
        // Analyser was disconnected mid-flight — bail cleanly
        return
      }

      // Throttle state updates to ~30 fps (33 ms)
      if (now - lastUpdateRef.current < 33) return
      lastUpdateRef.current = now

      // RMS of the time-domain signal, centered on 128
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      // Normalize: typical voice RMS ~0.01–0.3 → scale to 0-1, clamp
      const normalized = Math.min(rms * 6, 1)
      setAudioLevel(normalized)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const handleTap = useCallback(async () => {
    if (audioState !== 'idle') return
    if (prefersReducedMotion.current) return

    // iOS Safari rule: AudioContext MUST be constructed synchronously inside
    // the user-gesture handler — before any `await` boundary. After an await
    // the gesture window closes and the constructor throws. We build the ctx
    // first, then do the async getUserMedia, then resume/connect.
    let ctx: AudioContext
    try {
      const Ctx =
        typeof window === 'undefined'
          ? undefined
          : window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext
      if (!Ctx) {
        setAudioState('denied')
        return
      }
      ctx = new Ctx()
    } catch {
      setAudioState('denied')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioCtxRef.current = ctx

      // iOS often leaves a fresh context suspended — explicit resume.
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          // Non-fatal — some iOS versions resume implicitly on first read
        }
      }

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source
      source.connect(analyser)
      // Do NOT connect analyser to destination — silent monitoring

      setAudioState('listening')
      startLoop()
    } catch {
      // Clean up the ctx we already built so we don't leak an AudioContext
      try {
        if (ctx.state !== 'closed') {
          void ctx.close()
        }
      } catch {
        // swallow — close() sometimes throws after a failed init path
      }
      audioCtxRef.current = null
      setAudioState('denied')
    }
  }, [audioState, startLoop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio()
    }
  }, [stopAudio])

  // Resolve the 4-color tuple — pad/truncate user-supplied array if needed
  const resolvedColors: [string, string, string, string] = [
    colors?.[0] ?? DEFAULT_COLORS[0],
    colors?.[1] ?? DEFAULT_COLORS[1],
    colors?.[2] ?? DEFAULT_COLORS[2],
    colors?.[3] ?? DEFAULT_COLORS[3],
  ]

  const labelText =
    audioState === 'idle'      ? 'TAP TO LISTEN' :
    audioState === 'listening' ? 'LISTENING...'  :
                                 'MIC BLOCKED'

  const labelColor =
    audioState === 'denied' ? 'text-red-400' : ''

  return (
    <div
      className={`mc-panel mc-corners relative overflow-hidden ${className}`}
      style={{ height }}
      onClick={handleTap}
      role="button"
      aria-label={labelText}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') void handleTap() }}
    >
      {/* R3F canvas fills the container */}
      <div className="absolute inset-0">
        <AgentOrbScene
          colors={resolvedColors}
          audioLevel={prefersReducedMotion.current ? 0 : audioLevel}
        />
      </div>

      {/* Hint label overlaid at bottom center */}
      <span
        className={[
          'absolute bottom-2 left-1/2 -translate-x-1/2',
          'mc-mono mc-label mc-label-brass text-[10px]',
          'pointer-events-none select-none',
          labelColor,
        ].join(' ')}
      >
        {labelText}
      </span>
    </div>
  )
}

export default AmbientOrb
