'use client'

import { AnimatePresence, motion } from 'framer-motion'
import JarvisOrb from './JarvisOrb'

interface VoiceTabProps {
  isListening: boolean
  isSpeaking: boolean
  isThinking: boolean
  alwaysListening: boolean
  onToggleListening: () => void
  onToggleAlwaysListening: () => void
  lastTranscript: string
  lastReply: string
  /** Whether SpeechRecognition is available in this browser. */
  voiceSupported: boolean
  /** Last voice error string from the hook, or null. */
  voiceError: string | null
  /**
   * Whether the user has tapped the unlock button yet (iOS audio gate).
   * When false, show the unlock CTA before anything else.
   */
  audioUnlocked: boolean
  onUnlock: () => void
}

export default function VoiceTab({
  isListening,
  isSpeaking,
  isThinking,
  alwaysListening,
  onToggleListening,
  onToggleAlwaysListening,
  lastTranscript,
  lastReply,
  voiceSupported,
  voiceError,
  audioUnlocked,
  onUnlock,
}: VoiceTabProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 gap-8">

      {/* iOS audio unlock — shown until the user taps it once */}
      <AnimatePresence>
        {!audioUnlocked && (
          <motion.div
            key="unlock"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-sm"
          >
            <button
              onClick={onUnlock}
              className="w-full py-3 rounded-xl font-mono text-[11px] tracking-widest uppercase text-[#00D4FF] border border-[#00D4FF]/30 bg-[#00D4FF]/5 hover:bg-[#00D4FF]/10 transition-colors focus:outline-none"
            >
              Tap to activate audio
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unsupported browser warning */}
      {!voiceSupported && (
        <div className="w-full max-w-sm rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-center">
          <p className="font-mono text-[10px] tracking-widest text-red-400/80 uppercase mb-1">
            Mic not available
          </p>
          <p className="font-mono text-[9px] text-white/30 leading-relaxed">
            Use Chrome on Android or Safari on iOS 17+
          </p>
        </div>
      )}

      {/* Error display */}
      {voiceSupported && voiceError && (
        <div className="w-full max-w-sm rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-center">
          <p className="font-mono text-[9px] tracking-widest text-red-400/60 uppercase">
            {voiceError === 'not-allowed' ? 'Mic permission denied — tap to retry' : voiceError}
          </p>
        </div>
      )}

      {/* Orb */}
      <JarvisOrb
        isListening={isListening}
        isSpeaking={isSpeaking}
        isThinking={isThinking}
        onPress={voiceSupported ? onToggleListening : undefined}
      />

      {/* Always Listening toggle */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] tracking-widest text-white/40 uppercase">
          Always Listening
        </span>
        <button
          onClick={onToggleAlwaysListening}
          role="switch"
          aria-checked={alwaysListening}
          className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${
            alwaysListening ? 'bg-[#00D4FF]/80' : 'bg-white/10'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
              alwaysListening ? 'translate-x-5 bg-white' : 'translate-x-0.5 bg-white/40'
            }`}
          />
        </button>
      </div>

      {/* Transcript + reply — fade in/out per entry */}
      <AnimatePresence mode="popLayout">
        {(lastTranscript || lastReply) && (
          <motion.div
            key="transcript-block"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm flex flex-col gap-3"
          >
            <AnimatePresence mode="popLayout">
              {lastTranscript && (
                <motion.div
                  key={`t-${lastTranscript.slice(0, 20)}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-lg border border-white/5 p-3"
                  style={{ background: 'rgba(0,212,255,0.04)' }}
                >
                  <p className="font-mono text-[9px] tracking-widest text-[#00D4FF]/40 uppercase mb-1">
                    You
                  </p>
                  <p className="text-sm italic text-white/50 leading-relaxed line-clamp-3">
                    {lastTranscript}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout">
              {lastReply && (
                <motion.div
                  key={`r-${lastReply.slice(0, 20)}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-lg border border-[#00D4FF]/10 p-3"
                  style={{ background: 'rgba(0,212,255,0.07)' }}
                >
                  <p className="font-mono text-[9px] tracking-widest text-[#00D4FF]/60 uppercase mb-1">
                    Jarvis
                  </p>
                  <p className="text-sm text-white/80 leading-relaxed line-clamp-3">
                    {lastReply}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Usage hint */}
      <p className="font-mono text-[10px] tracking-widest text-white/20 text-center">
        {isListening ? 'Tap orb to send' : 'Tap orb to start talking'}
      </p>
    </div>
  )
}
