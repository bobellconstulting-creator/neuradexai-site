'use client'

import { AGENTS } from '@/lib/agents'
import AgentDesk from './AgentDesk'
import { useBridge } from '@/hooks/useBridge'

export default function BoardroomGrid() {
  const { agentStatuses } = useBridge()

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4 gap-4">
        {AGENTS.map((agent, i) => (
          <AgentDesk
            key={agent.id}
            agent={agent}
            status={agentStatuses[agent.id] ?? 'idle'}
            index={i}
          />
        ))}
      </div>
    </div>
  )
}
