'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'
import { CommunalChat } from '@/components/mission-control/CommunalChat'
import { VoiceChat } from '@/components/mission-control/VoiceChat'
import { BOARDROOM } from '@/lib/missionChannels'

type ChatMode = 'communal' | 'voice'

export default function BoardroomPage() {
  const router = useRouter()
  const { telemetry, connected } = useMissionBridge()
  const [mode, setMode] = useState<ChatMode>('communal')

  return (
    <div className="mc-root">
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected || telemetry.bridgeUp} />

        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">
          {/* Header */}
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-4 flex-shrink-0 flex-wrap gap-y-2">
            <button
              onClick={() => router.push('/mission-control')}
              className="mc-mono text-[11px] tracking-widest px-3 py-1 min-h-[44px] border border-[var(--mc-border)] text-sand-dim hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)] rounded"
            >
              ← LOBBY
            </button>
            <span className="text-3xl" style={{ color: '#efb356' }}>⬢</span>
            <div className="flex flex-col">
              <span className="mc-mono text-lg tracking-[0.22em] font-semibold text-[#efb356]">
                THE BOARDROOM
              </span>
              <span className="mc-label">
                Shared room · everything here is visible to every agent
              </span>
            </div>

            {/* Mode toggle */}
            <div className="ml-auto flex items-center gap-1 bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded p-0.5">
              <button
                onClick={() => setMode('communal')}
                className={`mc-mono text-[10px] tracking-widest px-3 py-1.5 rounded transition-all ${
                  mode === 'communal'
                    ? 'bg-[rgba(0,212,255,0.15)] text-[var(--mc-cyan)] border border-[var(--mc-cyan)]'
                    : 'text-[var(--mc-text-mute)] hover:text-sand'
                }`}
              >
                FLEET CHAT
              </button>
              <button
                onClick={() => setMode('voice')}
                className={`mc-mono text-[10px] tracking-widest px-3 py-1.5 rounded transition-all ${
                  mode === 'voice'
                    ? 'bg-[rgba(0,212,255,0.15)] text-[var(--mc-cyan)] border border-[var(--mc-cyan)]'
                    : 'text-[var(--mc-text-mute)] hover:text-sand'
                }`}
              >
                VOICE · JARVIS
              </button>
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-h-0 flex flex-col max-w-4xl mx-auto w-full">
              {mode === 'communal' ? (
                <CommunalChat
                  channel={BOARDROOM}
                  title="BOARDROOM · ALL AGENTS"
                  placeholder="@mention one agent for a private office chat, @mention multiple to meet here…"
                />
              ) : (
                <div className="mc-panel mc-corners flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)]">
                    <span className="mc-label mc-label-brass">JARVIS · DIRECT LINE</span>
                    <span className="mc-label text-[var(--mc-cyan)]">VOICE ENABLED</span>
                  </div>
                  <VoiceChat
                    agentId="jarvis"
                    agentColor="#00F2FF"
                    agentLabel="JARVIS"
                    channel="mission-control"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <BottomBar />
      </div>
    </div>
  )
}
