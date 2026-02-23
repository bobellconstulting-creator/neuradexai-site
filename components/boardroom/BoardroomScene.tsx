'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import BoardroomFloor from './BoardroomFloor'
import CoreLogo from './CoreLogo'
import AgentNode3D from './AgentNode3D'
import type { Agent } from '@/components/boardroom/boardroomData'

interface BoardroomSceneProps {
  agents: Agent[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
}

function agentPosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  const radius = 2.5
  return [
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  ]
}

export default function BoardroomScene({
  agents,
  selectedAgentId,
  onSelectAgent,
}: BoardroomSceneProps) {
  const hasSelection = selectedAgentId !== null

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={false}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onPointerMissed={() => onSelectAgent(selectedAgentId ?? '')}
      >
        <Suspense fallback={null}>
          {/* Camera */}
          <PerspectiveCamera makeDefault fov={45} position={[0, 9, 9]} />

          {/* Lights */}
          <ambientLight intensity={0.3} color="#ffffff" />
          <pointLight position={[0, 4, 0]} color="#00F2FF" intensity={1.5} />
          <pointLight position={[0, -2, 0]} color="#8b5cf6" intensity={0.5} />

          {/* Floor */}
          <BoardroomFloor />

          {/* Central N Logo */}
          <CoreLogo hasSelection={hasSelection} />

          {/* Agent Nodes */}
          {agents.map((agent, i) => (
            <AgentNode3D
              key={agent.id}
              agent={agent}
              position={agentPosition(i, agents.length)}
              isSelected={agent.id === selectedAgentId}
              hasAnySelection={hasSelection}
              onSelect={onSelectAgent}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* Scanline overlay for atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,242,255,0.012) 2px, rgba(0,242,255,0.012) 4px)',
        }}
      />
    </div>
  )
}
