'use client'

import { useMemo, useState } from 'react'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { TopBar } from '@/components/mission-control/TopBar'
import { LeftRail, type MCView } from '@/components/mission-control/LeftRail'
import { BottomBar } from '@/components/mission-control/BottomBar'
import { RadarSweep } from '@/components/mission-control/RadarSweep'
import { AgentConsole } from '@/components/mission-control/AgentConsole'
import { LiveFeed } from '@/components/mission-control/LiveFeed'
import { CommunalChat } from '@/components/mission-control/CommunalChat'
import { TaskBoard } from '@/components/mission-control/TaskBoard'

// The full 7-agent fleet. Axon is part of Marcus (bridge relay), so he
// stays hidden. Everyone else is wired into the dispatcher.
const ACTIVE_AGENT_IDS = ['jarvis', 'linda', 'marcus', 'atlas', 'claude', 'bob', 'aria']

export default function MissionControlPage() {
  const { agents, events, telemetry, connected } = useMissionBridge()
  const [view, setView] = useState<MCView>('overview')

  const visibleAgents = useMemo(
    () => agents.filter((a) => ACTIVE_AGENT_IDS.includes(a.id)),
    [agents],
  )

  const activeTaskCount = useMemo(
    () => visibleAgents.filter((a) => a.status === 'busy').length + Math.floor(events.length / 4),
    [visibleAgents, events.length],
  )

  return (
    <div className="mc-root">
      {/* Background layers */}
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      {/* Frame */}
      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected || telemetry.bridgeUp} />

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          <LeftRail active={view} onChange={setView} />

          {/* Main grid: 3 columns */}
          <main className="flex-1 grid grid-cols-12 gap-3 p-4 min-h-0">
            {/* LEFT: Fleet agent consoles */}
            <section className="col-span-3 flex flex-col gap-3 min-h-0">
              <div className="mc-panel mc-corners p-3 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="mc-label mc-label-brass">AGENT FLEET</span>
                  <span className="mc-label">{visibleAgents.length}/{visibleAgents.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 overflow-y-auto mc-scroll pr-1">
                  {visibleAgents.map((a) => (
                    <a
                      key={a.id}
                      href={`/mission-control/agents/${a.id}`}
                      className="block focus:outline-none focus:ring-1 focus:ring-[var(--mc-cyan)] rounded"
                    >
                      <AgentConsole agent={a} events={events} />
                    </a>
                  ))}
                </div>
              </div>
            </section>

            {/* CENTER: Radar on top, Communal chat below */}
            <section className="col-span-6 flex flex-col gap-3 min-h-0">
              <div className="relative mc-panel mc-corners min-h-[300px] flex-shrink-0 flex flex-col items-center justify-center overflow-hidden">
                <div className="absolute top-3 left-4 flex items-center gap-3">
                  <span className="mc-label mc-label-brass">PRIMARY SCOPE</span>
                  <span className="mc-label">VIEW · {view.toUpperCase()}</span>
                </div>
                <div className="absolute top-3 right-4 flex items-center gap-2">
                  <span className="mc-dot mc-dot-on" />
                  <span className="mc-label">
                    TRACKING {visibleAgents.filter((a) => a.status !== 'offline').length}
                  </span>
                </div>
                <div className="w-full h-full p-4">
                  <RadarSweep agents={visibleAgents} taskCount={activeTaskCount} />
                </div>
              </div>

              {/* Communal chat — the heartbeat of the HUD */}
              <CommunalChat />
            </section>

            {/* RIGHT: Task Board (proof of work) on top, Live feed on bottom */}
            <section className="col-span-3 flex flex-col gap-3 min-h-0">
              <div className="flex-[2] min-h-0">
                <TaskBoard />
              </div>
              <div className="flex-1 min-h-0">
                <LiveFeed events={events} />
              </div>
            </section>
          </main>
        </div>

        <BottomBar telemetry={telemetry} />
      </div>
    </div>
  )
}
