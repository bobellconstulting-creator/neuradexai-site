'use client'

import { motion, type Variants } from 'framer-motion'

interface JarvisOrbProps {
  isListening: boolean
  isSpeaking: boolean
  isThinking: boolean
  onPress?: () => void
}

type OrbState = 'listening' | 'speaking' | 'thinking' | 'idle'

function getStateLabel(state: OrbState): string {
  switch (state) {
    case 'listening': return 'Listening...'
    case 'speaking':  return 'Speaking...'
    case 'thinking':  return 'Thinking...'
    default:          return 'Tap to activate'
  }
}

function resolveState(isListening: boolean, isSpeaking: boolean, isThinking: boolean): OrbState {
  if (isListening) return 'listening'
  if (isSpeaking)  return 'speaking'
  if (isThinking)  return 'thinking'
  return 'idle'
}

const ringVariants: Variants = {
  idle: {
    scale: [1, 1.04, 1],
    opacity: [0.15, 0.25, 0.15],
    transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.08, 1],
    opacity: [0.5, 0.9, 0.5],
    transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    scale: [1, 1.15, 1],
    opacity: [0.6, 1, 0.6],
    transition: { duration: 0.7, repeat: Infinity, ease: 'easeOut' },
  },
  thinking: {
    rotate: [0, 360],
    opacity: [0.2, 0.4, 0.2],
    transition: { rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' } },
  },
}

const glowVariants: Variants = {
  idle: {
    opacity: [0.08, 0.15, 0.08],
    scale: [1, 1.03, 1],
    transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    opacity: [0.4, 0.75, 0.4],
    scale: [1, 1.05, 1],
    transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    opacity: [0.5, 0.9, 0.5],
    scale: [1, 1.06, 1],
    transition: { duration: 0.7, repeat: Infinity, ease: 'easeOut' },
  },
  thinking: {
    opacity: [0.15, 0.35, 0.15],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
}

export default function JarvisOrb({ isListening, isSpeaking, isThinking, onPress }: JarvisOrbProps) {
  const state = resolveState(isListening, isSpeaking, isThinking)
  const label = getStateLabel(state)

  const ringColor = '#00D4FF'

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <motion.button
        onClick={onPress}
        whileTap={{ scale: 0.95 }}
        className="relative flex items-center justify-center focus:outline-none"
        style={{ width: 160, height: 160 }}
        aria-label={label}
      >
        {/* Outer animated ring */}
        <motion.div
          variants={ringVariants}
          animate={state}
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: ringColor, borderStyle: state === 'thinking' ? 'dashed' : 'solid' }}
        />

        {/* Secondary ripple ring (speaking only) */}
        {state === 'speaking' && (
          <motion.div
            animate={{ scale: [1, 1.3], opacity: [0.4, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full border border-[#00D4FF]"
          />
        )}

        {/* Inner glow fill */}
        <motion.div
          variants={glowVariants}
          animate={state}
          className="absolute inset-4 rounded-full"
          style={{ background: `radial-gradient(circle, ${ringColor} 0%, transparent 70%)` }}
        />

        {/* Core orb surface */}
        <div
          className="relative z-10 w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle at 35% 30%, rgba(0,80,130,0.6) 0%, rgba(0,8,16,0.95) 70%)',
            border: `1px solid ${ringColor}22`,
            boxShadow: state !== 'idle'
              ? `0 0 24px ${ringColor}55, inset 0 0 16px ${ringColor}22`
              : `0 0 8px ${ringColor}22, inset 0 0 8px ${ringColor}11`,
          }}
        >
          {/* Center dot */}
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: ringColor,
              opacity: state === 'idle' ? 0.3 : 0.85,
              boxShadow: `0 0 8px ${ringColor}`,
            }}
          />
        </div>
      </motion.button>

      {/* State label */}
      <span className="font-mono text-[10px] tracking-widest text-[#00D4FF]/50 uppercase">
        {label}
      </span>
    </div>
  )
}
