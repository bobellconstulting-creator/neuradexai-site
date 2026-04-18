/**
 * Voice mode detection — checks if a message was flagged as a voice request
 * and whether voice reply should be sent back.
 */

export type VoiceMode = 'none' | 'stt_only' | 'full_duplex'

const VOICE_PREFIXES = /^(voice:|va:|speak:|v:)\s*/i

export function detectVoiceMode(message: string): { mode: VoiceMode; stripped: string } {
  if (!VOICE_PREFIXES.test(message)) return { mode: 'none', stripped: message }
  const stripped = message.replace(VOICE_PREFIXES, '').trim()
  const mode: VoiceMode = stripped ? 'full_duplex' : 'stt_only'
  return { mode, stripped }
}

export function voiceReplyEnabled(): boolean {
  return Boolean(process.env.JARVIS_VOICE_REPLY === '1')
}
