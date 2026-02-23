import { useMemo } from 'react'
import { useBridge } from './useBridge'
import type { AgentStatus } from '@/components/providers/BridgeProvider'

export function useAgentChat(agentId: string) {
  const { messages, agentStatuses, sendMessage, clearMessages } = useBridge()

  const agentMessages = useMemo(() => messages[agentId] ?? [], [messages, agentId])
  const status: AgentStatus = agentStatuses[agentId] ?? 'idle'

  return {
    messages:     agentMessages,
    status,
    send:         (content: string) => sendMessage(agentId, content),
    clearHistory: () => clearMessages(agentId),
  }
}
