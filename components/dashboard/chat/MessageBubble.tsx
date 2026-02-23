import { motion } from 'framer-motion'
import type { Message } from '@/components/providers/BridgeProvider'
import type { AgentConfig } from '@/lib/agents'

interface MessageBubbleProps {
  message: Message
  agent:   AgentConfig
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message, agent }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[72%]">
          <div className="flex items-center justify-end gap-2 mb-1">
            <span className="font-mono text-[9px] text-neural-muted/40 tracking-wider">
              {formatTime(message.ts)}
            </span>
            <span className="font-mono text-[9px] text-neural-cyan/60 tracking-wider">
              YOU
            </span>
          </div>
          <div
            className="rounded-xl rounded-tr-sm px-4 py-2.5 text-sm text-neural-text leading-relaxed"
            style={{
              background: 'rgba(0, 242, 255, 0.08)',
              border:     '1px solid rgba(0, 242, 255, 0.18)',
            }}
          >
            {message.content}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-start"
    >
      <div className="max-w-[80%]">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="font-mono text-[9px] tracking-wider font-bold"
            style={{ color: agent.color }}
          >
            {agent.label}
          </span>
          <span className="font-mono text-[9px] text-neural-muted/40 tracking-wider">
            {formatTime(message.ts)}
          </span>
        </div>
        <div
          className="rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-neural-text leading-relaxed"
          style={{
            background: agent.bgColor,
            border:     `1px solid ${agent.color}22`,
          }}
        >
          {message.content}
          {message.streaming && (
            <span
              className="inline-block w-[2px] h-[14px] ml-0.5 align-middle rounded-sm animate-pulse"
              style={{ background: agent.color }}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}
