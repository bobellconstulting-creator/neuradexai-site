'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AGENTS } from '@/lib/agents'
import { useMissionBridge } from '@/lib/useMissionBridge'
import { useMissionTasks } from '@/lib/useMissionTasks'
import { TopBar } from '@/components/mission-control/TopBar'
import { BottomBar } from '@/components/mission-control/BottomBar'
import { TaskBoard } from '@/components/mission-control/TaskBoard'
import { RadarSweep } from '@/components/mission-control/RadarSweep'
import { LiveFeed } from '@/components/mission-control/LiveFeed'

// Agents visible in the lobby. Aria lives on Bo's desktop separately;
// Axon is part of Marcus.
const ACTIVE_AGENT_IDS = ['jarvis', 'linda', 'marcus', 'atlas', 'claude', 'bob', 'aria']

export default function MissionControlLobbyPage() {
  const router = useRouter()
  const { agents, events, telemetry, connected } = useMissionBridge()
  const { tasks, counts } = useMissionTasks(3000)

  const visibleAgents = useMemo(
    () => agents.filter((a) => ACTIVE_AGENT_IDS.includes(a.id)),
    [agents],
  )

  const perAgentTasks = useMemo(() => {
    const map: Record<string, { active: number; done: number; blocked: number }> = {}
    for (const id of ACTIVE_AGENT_IDS) {
      map[id] = { active: 0, done: 0, blocked: 0 }
    }
    for (const t of tasks) {
      if (!map[t.assignedTo]) continue
      if (t.status === 'open' || t.status === 'in_progress') map[t.assignedTo].active++
      else if (t.status === 'done') map[t.assignedTo].done++
      else if (t.status === 'blocked') map[t.assignedTo].blocked++
    }
    return map
  }, [tasks])

  const activeTaskCount = useMemo(
    () => counts.in_progress + counts.open,
    [counts],
  )

  return (
    <div className="mc-root">
      <div className="mc-grid-bg" />
      <div className="mc-scanlines" />
      <div className="mc-scanbar" />

      <div className="absolute inset-0 flex flex-col">
        <TopBar bridgeUp={connected || telemetry.bridgeUp} />

        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">
          {/* Lobby header */}
          <div className="mc-panel mc-corners px-4 py-3 flex items-center gap-6 flex-shrink-0">
            <div className="flex flex-col">
              <span className="mc-mono text-sm tracking-[0.22em] font-bold text-[var(--mc-cyan)]">
                THE BUILDING
              </span>
              <span className="mc-label">Bo&apos;s lobby · 7 offices · 1 boardroom</span>
            </div>
            <div className="ml-auto flex items-center gap-5">
              <LobbyStat label="TOTAL TASKS" value={counts.total} color="#edf3ff" />
              <LobbyStat label="ACTIVE"      value={counts.open + counts.in_progress} color="#00d4ff" />
              <LobbyStat label="DONE"        value={counts.done}    color="#22c55e" />
              <LobbyStat label="BLOCKED"     value={counts.blocked} color="#ff6060" />
              <LobbyStat label="$ REVENUE"   value={counts.revenue} color="#22c55e" />
            </div>
          </div>

          {/* Main lobby grid */}
          <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
            {/* LEFT: office doors */}
            <section className="col-span-4 flex flex-col gap-3 min-h-0">
              <div className="mc-panel mc-corners p-3 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="mc-label mc-label-brass">AGENT OFFICES</span>
                  <span className="mc-label">{visibleAgents.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 overflow-y-auto mc-scroll pr-1">
                  {visibleAgents.map((a) => {
                    const stats = perAgentTasks[a.id] ?? { active: 0, done: 0, blocked: 0 }
                    return (
                      <OfficeDoor
                        key={a.id}
                        agent={a}
                        activeCount={stats.active}
                        doneCount={stats.done}
                        blockedCount={stats.blocked}
                        onClick={() => router.push(`/mission-control/agents/${a.id}`)}
                      />
                    )
                  })}

                  {/* Boardroom door */}
                  <button
                    onClick={() => router.push('/mission-control/boardroom')}
                    className="flex items-center gap-3 p-3 rounded border-2 border-dashed border-[rgba(239,179,86,0.30)] bg-[rgba(239,179,86,0.04)] hover:border-[#efb356] hover:bg-[rgba(239,179,86,0.08)] transition-all text-left group mt-2"
                  >
                    <span className="text-3xl" style={{ color: '#efb356' }}>⬢</span>
                    <div className="flex-1">
                      <div className="mc-mono text-xs tracking-[0.22em] font-bold text-[#efb356]">
                        BOARDROOM
                      </div>
                      <div className="mc-label text-[10px]">The shared room — opt-in only</div>
                    </div>
                    <span className="mc-mono text-[10px] text-[var(--mc-text-mute)] group-hover:text-[#efb356]">
                      ENTER →
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* CENTER: radar + task board */}
            <section className="col-span-5 flex flex-col gap-3 min-h-0">
              <div className="relative mc-panel mc-corners flex-shrink-0 h-[300px] flex items-center justify-center overflow-hidden">
                <div className="absolute top-3 left-4 flex items-center gap-3">
                  <span className="mc-label mc-label-brass">PRIMARY SCOPE</span>
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

              <div className="flex-1 min-h-0">
                <TaskBoard />
              </div>
            </section>

            {/* RIGHT: live feed */}
            <section className="col-span-3 flex flex-col min-h-0">
              <LiveFeed events={events} />
            </section>
          </div>
        </div>

        <BottomBar telemetry={telemetry} />
      </div>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function LobbyStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="mc-mono text-xl font-bold leading-none" style={{ color }}>
        {value.toString().padStart(2, '0')}
      </span>
      <span className="mc-label text-[9px]">{label}</span>
    </div>
  )
}

interface OfficeDoorProps {
  agent: {
    id:    string
    label: string
    role:  string
    model: string
    color: string
    status: string
    latencyMs: number
    lastAction: string
  }
  activeCount: number
  doneCount: number
  blockedCount: number
  onClick: () => void
}

function OfficeDoor({ agent, activeCount, doneCount, blockedCount, onClick }: OfficeDoorProps) {
  const statusDot =
    agent.status === 'online'  ? 'mc-dot-on'   :
    agent.status === 'busy'    ? 'mc-dot-busy' :
    agent.status === 'idle'    ? 'mc-dot-warn' :
                                 'mc-dot-off'

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded border transition-all text-left group"
      style={{
        borderColor: `${agent.color}25`,
        background: `${agent.color}06`,
      }}
    >
      {/* Status dot */}
      <span className={`mc-dot ${statusDot} shrink-0`} />

      {/* Label + role */}
      <div className="flex-1 min-w-0">
        <div
          className="mc-mono text-xs tracking-[0.22em] font-bold truncate"
          style={{ color: agent.color }}
        >
          {agent.label}&apos;S OFFICE
        </div>
        <div className="mc-label text-[9px] truncate">{agent.role}</div>
      </div>

      {/* Task counts */}
      <div className="flex items-center gap-2 shrink-0">
        {activeCount > 0 && (
          <div className="flex flex-col items-center">
            <span className="mc-mono text-sm font-bold text-[#00d4ff]">{activeCount}</span>
            <span className="mc-label text-[8px]">ACT</span>
          </div>
        )}
        {doneCount > 0 && (
          <div className="flex flex-col items-center">
            <span className="mc-mono text-sm font-bold text-[#22c55e]">{doneCount}</span>
            <span className="mc-label text-[8px]">DONE</span>
          </div>
        )}
        {blockedCount > 0 && (
          <div className="flex flex-col items-center">
            <span className="mc-mono text-sm font-bold text-[#ff6060]">{blockedCount}</span>
            <span className="mc-label text-[8px]">BLK</span>
          </div>
        )}
      </div>

      {/* Enter arrow */}
      <span className="mc-mono text-[10px] text-[var(--mc-text-mute)] group-hover:text-[var(--mc-cyan)] shrink-0">
        →
      </span>
    </button>
  )
}
