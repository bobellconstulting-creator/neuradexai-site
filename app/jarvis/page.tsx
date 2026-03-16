'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import JarvisHUD from '@/components/jarvis/JarvisHUD'
import JarvisChat from '@/components/jarvis/JarvisChat'
import {
  JARVIS_TEAM,
  JARVIS_STUBS,
  BROADCAST_STUBS,
  type JarvisMessage,
} from '@/components/jarvis/jarvisData'

// Load 3D scene client-side only (Three.js requires browser)
const JarvisScene = dynamic(() => import('@/components/jarvis/JarvisScene'), { ssr: false })

export default function JarvisPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [chatMode, setChatMode]               = useState<'private' | 'broadcast'>('broadcast')
  const [messages, setMessages]               = useState<JarvisMessage[]>([
    {
      id:     '0',
      agentId: 'jarvis',
      role:   'agent',
      text:   'Good evening. J.A.R.V.I.S. boardroom is online. All agents are standing by. How may I assist?',
      ts:     Date.now() - 5000,
    },
  ])

  const selectedAgent = JARVIS_TEAM.find(a => a.id === selectedAgentId) ?? null

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
    const targetId = chatMode === 'private' && selectedAgentId ? selectedAgentId : 'broadcast'

    const userMsg: JarvisMessage = {
      id:      `${Date.now()}-u`,
      agentId: targetId,
      role:    'user',
      text,
      ts:      Date.now(),
    }
    setMessages(prev => [...prev, userMsg].slice(-30))

    // Simulate OpenClaw agent response (replace setTimeout with real WS call)
    setTimeout(() => {
      const responderId = chatMode === 'private' && selectedAgentId ? selectedAgentId : 'jarvis'
      const responder   = JARVIS_TEAM.find(a => a.id === responderId)!
      const stubs       = chatMode === 'broadcast' ? BROADCAST_STUBS : (JARVIS_STUBS[responderId] ?? JARVIS_STUBS.jarvis)
      const reply       = stubs[Math.floor(Math.random() * stubs.length)]

      const agentMsg: JarvisMessage = {
        id:      `${Date.now()}-a`,
        agentId: targetId,
        role:    'agent',
        text:    `[${responder.label}] ${reply}`,
        ts:      Date.now(),
      }
      setMessages(prev => [...prev, agentMsg].slice(-30))
    }, 900 + Math.random() * 700)
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#000810' }}>

      {/* Deep holographic background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 60%, rgba(0,55,110,0.22) 0%, rgba(0,10,28,0.75) 55%, #000810 100%)',
        }}
      />

      {/* 3D holographic scene */}
      <JarvisScene
        agents={JARVIS_TEAM}
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
      />

      {/* Iron Man HUD overlay */}
      <JarvisHUD agents={JARVIS_TEAM} selectedAgent={selectedAgent} />

      {/* JARVIS chat interface */}
      <JarvisChat
        agents={JARVIS_TEAM}
        selectedAgent={selectedAgent}
        chatMode={chatMode}
        messages={messages}
        onSend={handleSend}
        onToggleMode={() =>
          setChatMode(m => (m === 'private' ? 'broadcast' : 'private'))
        }
      />
    </div>
  )
}
