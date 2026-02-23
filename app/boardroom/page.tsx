'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import HUDOverlay from '@/components/boardroom/HUDOverlay'
import OmniChat from '@/components/boardroom/OmniChat'
import { AGENTS, type Message } from '@/components/boardroom/boardroomData'

const BoardroomScene = dynamic(
  () => import('@/components/boardroom/BoardroomScene'),
  { ssr: false }
)

export default function BoardroomPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [chatMode, setChatMode] = useState<'private' | 'broadcast'>('broadcast')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      agentId: 'all',
      role: 'agent',
      text: 'BOARDROOM ONLINE. All agents standing by. Awaiting directives.',
      ts: Date.now() - 5000,
    },
  ])

  const selectedAgent = AGENTS.find((a) => a.id === selectedAgentId) ?? null

  function handleSelectAgent(agentId: string) {
    if (agentId === selectedAgentId) {
      setSelectedAgentId(null)
      setChatMode('broadcast')
    } else {
      setSelectedAgentId(agentId)
      setChatMode('private')
    }
  }

  function handleSend(text: string) {
    const targetId = chatMode === 'private' && selectedAgentId ? selectedAgentId : 'all'
    const userMsg: Message = {
      id: `${Date.now()}-u`,
      agentId: targetId,
      role: 'user',
      text,
      ts: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg].slice(-20))

    setTimeout(() => {
      const agent =
        chatMode === 'private' && selectedAgentId
          ? AGENTS.find((a) => a.id === selectedAgentId)
          : null
      const responder = agent ? agent.label : 'NEXUS-CORE'
      const stubs = [
        'Directive received. Processing now.',
        'Acknowledged. Analyzing parameters.',
        'Confirmed. Executing protocol sequence.',
        'Input registered. Optimizing response vector.',
        'Command accepted. Calibrating subsystems.',
      ]
      const agentMsg: Message = {
        id: `${Date.now()}-a`,
        agentId: targetId,
        role: 'agent',
        text: `[${responder}] ${stubs[Math.floor(Math.random() * stubs.length)]}`,
        ts: Date.now(),
      }
      setMessages((prev) => [...prev, agentMsg].slice(-20))
    }, 1000)
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <BoardroomScene
        agents={AGENTS}
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
      />
      <HUDOverlay agents={AGENTS} selectedAgent={selectedAgent} />
      <OmniChat
        agents={AGENTS}
        selectedAgent={selectedAgent}
        chatMode={chatMode}
        messages={messages}
        onSend={handleSend}
        onToggleMode={() =>
          setChatMode((m) => (m === 'private' ? 'broadcast' : 'private'))
        }
      />
    </div>
  )
}
