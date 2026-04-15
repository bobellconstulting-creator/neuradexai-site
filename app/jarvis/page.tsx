'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import JarvisHUD from '@/components/jarvis/JarvisHUD'
import JarvisChat from '@/components/jarvis/JarvisChat'
import JarvisApproval from '@/components/jarvis/JarvisApproval'
import JarvisMobileShell from '@/components/jarvis/mobile/JarvisMobileShell'
import VoiceTab from '@/components/jarvis/mobile/VoiceTab'
import MobileChatTab from '@/components/jarvis/mobile/MobileChatTab'
import TasksTab from '@/components/jarvis/mobile/TasksTab'
import DocsTab from '@/components/jarvis/mobile/DocsTab'
import CalendarTab from '@/components/jarvis/mobile/CalendarTab'
import { JARVIS_TEAM, type JarvisMessage } from '@/components/jarvis/jarvisData'
import { useJarvisWS } from '@/hooks/useJarvisWS'
import { useJarvisVoice } from '@/hooks/useJarvisVoice'
import type { MissionTask } from '@/lib/missionTasks'
import type { IngestedDoc } from '@/lib/jarvis/doc-ingester'

const JarvisScene = dynamic(() => import('@/components/jarvis/JarvisScene'), { ssr: false })

type Tab = 'voice' | 'chat' | 'calendar' | 'tasks' | 'docs'

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center min-h-full">
      <span className="font-mono text-xs tracking-widest text-white/20 uppercase">{label} — Coming soon</span>
    </div>
  )
}

export default function JarvisPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [chatMode, setChatMode]               = useState<'private' | 'broadcast'>('broadcast')
  const [isSpeaking, setIsSpeaking]           = useState(false)
  const [isMobile, setIsMobile]               = useState(false)
  const [activeTab, setActiveTab]             = useState<Tab>('voice')
  const [audioUnlocked, setAudioUnlocked]     = useState(false)
  const audioLevelRef                         = useRef<number>(0)
  const [tasks, setTasks]                     = useState<MissionTask[]>([])
  const [tasksLoading, setTasksLoading]       = useState(false)

  // ── Docs state ──────────────────────────────────────────────────────────────
  const [recentDocs, setRecentDocs]               = useState<IngestedDoc[]>([])
  const [uploading, setUploading]                 = useState(false)
  const [uploadConfirmation, setUploadConfirmation] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true)
    try {
      const res = await fetch('/api/jarvis/tasks?status=open')
      const data = await res.json() as { ok: boolean; tasks?: MissionTask[] }
      if (data.ok && data.tasks) setTasks(data.tasks)
    } catch {
      // non-fatal — tasks will just show stale
    } finally {
      setTasksLoading(false)
    }
  }, [])

  useEffect(() => { void fetchTasks() }, [fetchTasks])
  useEffect(() => { if (activeTab === 'tasks') void fetchTasks() }, [activeTab, fetchTasks])

  const handleAddTask = useCallback(async (title: string) => {
    await fetch('/api/jarvis/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    await fetchTasks()
  }, [fetchTasks])

  const handleCompleteTask = useCallback(async (id: string) => {
    await fetch('/api/jarvis/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    })
    await fetchTasks()
  }, [fetchTasks])

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/jarvis/upload', { method: 'POST', body: form })
      const data = await res.json() as { ok: boolean; doc?: IngestedDoc; confirmation?: string }
      if (data.ok && data.doc && data.confirmation) {
        setUploadConfirmation(data.confirmation)
        setRecentDocs(prev => [data.doc!, ...prev].slice(0, 5))
      }
    } catch {
      // best-effort: UI stays unchanged if fetch throws
    } finally {
      setUploading(false)
    }
  }, [])

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

  const {
    state: voiceState,
    transcript: voiceTranscript,
    reply: voiceReply,
    error: voiceError,
    supported: voiceSupported,
    toggleListening,
    setAlwaysOn,
    alwaysOn,
    unlock,
  } = useJarvisVoice({
    alwaysOn: false,
    // No onReply callback — voice has its own history (voiceHistoryRef in the hook).
    // Feeding the reply back into the WS send() would cause an infinite loop.
  })

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

  if (isMobile) {
    return (
      <JarvisMobileShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isListening={voiceState === 'listening'}
        isSpeaking={isSpeaking}
        isThinking={isThinking}
        connected={true}
      >
        {activeTab === 'voice' && (
          <VoiceTab
            isListening={voiceState === 'listening'}
            isSpeaking={voiceState === 'speaking'}
            isThinking={voiceState === 'thinking'}
            alwaysListening={alwaysOn}
            onToggleListening={toggleListening}
            onToggleAlwaysListening={() => setAlwaysOn(!alwaysOn)}
            lastTranscript={voiceTranscript}
            lastReply={voiceReply}
            voiceError={voiceError}
            voiceSupported={voiceSupported}
            audioUnlocked={audioUnlocked}
            onUnlock={() => {
              unlock()
              setAudioUnlocked(true)
            }}
          />
        )}
        {activeTab === 'chat' && (
          <div className="h-full">
            <MobileChatTab />
          </div>
        )}
        {activeTab === 'calendar' && <CalendarTab />}
        {activeTab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            loading={tasksLoading}
            onAddTask={handleAddTask}
            onComplete={handleCompleteTask}
            onRefresh={fetchTasks}
          />
        )}
        {activeTab === 'docs' && (
          <DocsTab
            recentDocs={recentDocs}
            onUpload={handleUpload}
            uploading={uploading}
            lastConfirmation={uploadConfirmation}
          />
        )}
      </JarvisMobileShell>
    )
  }

  // Desktop layout — untouched
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
