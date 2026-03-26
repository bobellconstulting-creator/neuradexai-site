'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import JarvisHUD from '@/components/jarvis/JarvisHUD'
import JarvisChat from '@/components/jarvis/JarvisChat'
import JarvisApproval from '@/components/jarvis/JarvisApproval'
import { JARVIS_TEAM, type JarvisMessage } from '@/components/jarvis/jarvisData'
import { useJarvisWS } from '@/hooks/useJarvisWS'

const JarvisScene = dynamic(() => import('@/components/jarvis/JarvisScene'), { ssr: false })

export default function JarvisPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [chatMode, setChatMode]               = useState<'private' | 'broadcast'>('broadcast')
  const [isSpeaking, setIsSpeaking]           = useState(false)
  const audioLevelRef                         = useRef<number>(0)

  const {
    connected,
    state: agentState,
    messages: wsMessages,
    streamingText,
    pendingToolCalls,
    send,
    approve,
    deny,
    mode,
  } = useJarvisWS()

  const messages: JarvisMessage[] = wsMessages.map(m => ({
    id:      m.id,
    agentId: m.role === 'user' ? (selectedAgentId ?? 'broadcast') : 'jarvis',
    role:    m.role === 'user' ? 'user' : 'agent',
    text:    m.content,
    ts:      m.ts,
  }))

  if (streamingText) {
    messages.push({ id: 'streaming', agentId: 'jarvis', role: 'agent', text: streamingText + '▌', ts: Date.now() })
  }

  const selectedAgent = JARVIS_TEAM.find(a => a.id === selectedAgentId) ?? null
  const isThinking    = agentState === 'thinking' || agentState === 'acting'

  const agentTeam = JARVIS_TEAM.map(agent => ({
    ...agent,
    status: agent.id === 'jarvis'
      ? (isThinking ? 'processing' : agentState === 'idle' ? 'idle' : agentState === 'offline' ? 'alert' : isSpeaking ? 'speaking' : 'idle')
      : agent.status,
  }))

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#000810' }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 60%, rgba(0,55,110,0.22) 0%, rgba(0,10,28,0.75) 55%, #000810 100%)',
      }} />

      {/* Connection status */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 text-[10px] tracking-widest font-mono">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#00D4FF]' : 'bg-red-500'} animate-pulse`}
          style={{ boxShadow: connected ? '0 0 6px #00D4FF' : '0 0 6px #FF3B30' }} />
        <span className={connected ? 'text-[#00D4FF]/60' : 'text-red-400/60'}>
          {connected ? `JARVIS ONLINE · ${mode.toUpperCase()}` : 'OFFLINE'}
        </span>
      </div>

      {/* Voice-reactive 3D scene */}
      <JarvisScene
        agents={agentTeam}
        selectedAgentId={selectedAgentId}
        onSelectAgent={id => {
          if (id === selectedAgentId) { setSelectedAgentId(null); setChatMode('broadcast') }
          else { setSelectedAgentId(id); setChatMode('private') }
        }}
        audioLevel={audioLevelRef}
        isSpeaking={isSpeaking}
        isThinking={isThinking}
      />

      <JarvisHUD agents={agentTeam} selectedAgent={selectedAgent} />

      {pendingToolCalls.filter(tc => tc.status === 'pending').length > 0 && (
        <JarvisApproval
          pendingToolCalls={pendingToolCalls.filter(tc => tc.status === 'pending')}
          onApprove={approve}
          onDeny={deny}
        />
      )}

      <JarvisChat
        agents={agentTeam}
        selectedAgent={selectedAgent}
        chatMode={chatMode}
        messages={messages}
        onSend={text => { send(text) }}
        onToggleMode={() => setChatMode(m => m === 'private' ? 'broadcast' : 'private')}
        agentState={agentState}
        onAudioLevel={v => { audioLevelRef.current = v }}
        onSpeakingChange={setIsSpeaking}
      />
    </div>
  )
}
