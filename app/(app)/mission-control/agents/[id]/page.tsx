'use client'

import { notFound, useParams, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { getAgent } from '@/lib/agents'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { CommunalChat } from '@/components/mission-control/CommunalChat'
import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'

export default function AgentChatPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const agent = getAgent(params.id)
  const { telemetry, connected, agents, events } = useMissionBridge()

  if (!agent) {
    notFound()
  }

  const bridgeAgent = useMemo(() => agents.find((a) => a.id === agent!.id), [agents, agent])

  return (
    <div className="mc-root">
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected || telemetry.bridgeUp} />

        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
          {/* Header strip */}
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-4">
            <button
              onClick={() => router.push('/mission-control')}
              className="mc-mono text-[11px] tracking-widest px-3 py-1 border border-[var(--mc-border)] text-sand-dim hover:text-[var(--mc-cyan)] hover:border-[var(--mc-cyan)] rounded"
            >
              ← FLEET
            </button>
            <span className="text-xl" style={{ color: agent!.color }}>
              {agent!.icon}
            </span>
            <div className="flex flex-col">
              <span
                className="mc-mono text-sm tracking-[0.22em] font-semibold"
                style={{ color: agent!.color }}
              >
                {agent!.label}
              </span>
              <span className="mc-label">{agent!.role}</span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <span className="mc-label">MODEL · {agent!.model}</span>
              {agent!.port && <span className="mc-label mc-label-brass">:{agent!.port}</span>}
              {agent!.telegram && <span className="mc-label">{agent!.telegram}</span>}
              <span
                className={`mc-dot ${
                  bridgeAgent?.status === 'online'
                    ? 'mc-dot-on'
                    : bridgeAgent?.status === 'busy'
                    ? 'mc-dot-busy'
                    : bridgeAgent?.status === 'idle'
                    ? 'mc-dot-warn'
                    : 'mc-dot-off'
                }`}
              />
            </div>
          </div>

          {/* 1:1 chat */}
          <div className="flex-1 min-h-0 flex gap-3">
            <div className="flex-1 min-h-0 flex flex-col">
              <CommunalChat
                agentId={agent!.id}
                title={`DIRECT CHANNEL · ${agent!.label}`}
                placeholder={`Message ${agent!.displayName} directly…`}
              />
            </div>
          </div>
        </div>

        <BottomBar telemetry={telemetry} />
      </div>
    </div>
  )
}
