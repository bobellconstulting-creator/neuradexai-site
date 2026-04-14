'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useRouter } from 'next/navigation'
import * as THREE from 'three'

import { AGENTS } from '@/lib/agents'
import { useMissionTasks } from '@/lib/useMissionTasks'
import { useMissionStream } from '@/lib/useMissionStream'

import { AgentOrb } from './AgentOrb'
import type { OrbState } from './AgentOrb'
import { CommandCore } from './CommandCore'
import { ArenaFloor } from './ArenaFloor'
import { HudChrome } from './HudChrome'

// Current 4-agent fleet
const HUD_AGENT_IDS = ['doc', 'linda', 'marcus', 'vault'] as const
const HUD_AGENTS = AGENTS.filter(a => (HUD_AGENT_IDS as readonly string[]).includes(a.id))

const RING_RADIUS = 4.2
const RING_Y = 0.3

function orbPosition(index: number, total: number): [number, number, number] {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2
  return [
    Math.cos(angle) * RING_RADIUS,
    RING_Y,
    Math.sin(angle) * RING_RADIUS,
  ]
}

// Per-agent stream — determines thinking/idle from office channel activity
function useAgentOrbState(agentId: string, blockedAgentIds: Set<string>): OrbState {
  const { messages } = useMissionStream({
    channel: `office:${agentId}` as any,
    pollMs: 3000,
  })

  const isThinking = (() => {
    if (messages.length === 0) return false
    const hasPending = messages.some((m: any) => m.status === 'pending')
    if (hasPending) return true
    const latest = messages[messages.length - 1]
    if (!latest?.ts) return false
    return Date.now() - latest.ts < 8000
  })()

  if (blockedAgentIds.has(agentId)) return 'alert'
  if (isThinking) return 'thinking'
  return 'idle'
}

// One stable component per agent so hook count is fixed
function AgentStateWatcher({
  agentId,
  blockedIds,
  onState,
}: {
  agentId: string
  blockedIds: Set<string>
  onState: (id: string, s: OrbState) => void
}) {
  const state = useAgentOrbState(agentId, blockedIds)
  useEffect(() => {
    onState(agentId, state)
  }, [agentId, state, onState])
  return null
}

// Everything rendered inside the Canvas — must be client, must not use router
function SceneContents({
  states,
  hoveredId,
  onHoverIn,
  onHoverOut,
  onOrbClick,
  isMobile,
}: {
  states: Record<string, OrbState>
  hoveredId: string | null
  onHoverIn: (id: string) => void
  onHoverOut: () => void
  onOrbClick: (id: string) => void
  isMobile: boolean
}) {
  return (
    <>
      <color attach="background" args={['#02060c']} />
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 6, 0]} intensity={0.55} color="#efb356" />

      <Stars radius={60} depth={60} count={isMobile ? 600 : 1200} factor={2} fade saturation={0.5} />

      <CommandCore />
      <ArenaFloor />

      {HUD_AGENTS.map((agent, i) => (
        <AgentOrb
          key={agent.id}
          agent={agent}
          state={states[agent.id] ?? 'idle'}
          position={orbPosition(i, HUD_AGENTS.length)}
          onClick={() => onOrbClick(agent.id)}
          hovered={hoveredId === agent.id}
          onHoverIn={() => onHoverIn(agent.id)}
          onHoverOut={onHoverOut}
        />
      ))}

      <EffectComposer>
        <Bloom
          intensity={isMobile ? 0.6 : 1.4}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          height={isMobile ? 200 : 400}
        />
        <ChromaticAberration
          offset={isMobile ? new THREE.Vector2(0, 0) : new THREE.Vector2(0.0008, 0.0008)}
          blendFunction={BlendFunction.NORMAL}
          radialModulation={false}
          modulationOffset={0}
        />
      </EffectComposer>

      {!isMobile && (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.1}
          rotateSpeed={0.35}
          target={[0, 0.5, 0]}
        />
      )}
    </>
  )
}

export function HudScene() {
  const router = useRouter()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [orbStates, setOrbStates] = useState<Record<string, OrbState>>(
    () => Object.fromEntries(HUD_AGENTS.map(a => [a.id, 'idle' as OrbState]))
  )

  // All tasks — used to derive blocked agent ids
  const { tasks } = useMissionTasks(3000)
  const blockedIds = new Set(
    tasks
      .filter(t => t.status === 'blocked' && t.assignedTo)
      .map(t => t.assignedTo)
  )

  const handleState = useCallback((id: string, s: OrbState) => {
    setOrbStates(prev => prev[id] === s ? prev : { ...prev, [id]: s })
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleOrbClick = useCallback((id: string) => {
    router.push(`/mission-control/agents/${id}`)
  }, [router])

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        background: '#02060c',
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      {/* State watchers live outside Canvas — hooks are stable, not conditional */}
      {HUD_AGENTS.map(agent => (
        <AgentStateWatcher
          key={agent.id}
          agentId={agent.id}
          blockedIds={blockedIds}
          onState={handleState}
        />
      ))}

      <Canvas
        camera={{
          position: isMobile ? [0, 4.5, 12] : [0, 3.5, 9],
          fov: 50,
        }}
        dpr={[1, 2]}
        gl={{
          antialias: !isMobile,
          powerPreference: 'high-performance',
          alpha: false,
        }}
        style={{ touchAction: 'none', overflow: 'hidden' }}
      >
        <Suspense fallback={null}>
          <SceneContents
            states={orbStates}
            hoveredId={hoveredId}
            onHoverIn={setHoveredId}
            onHoverOut={() => setHoveredId(null)}
            onOrbClick={handleOrbClick}
            isMobile={isMobile}
          />
        </Suspense>
      </Canvas>

      <HudChrome
        agents={HUD_AGENTS}
        states={orbStates}
        hoveredId={hoveredId}
        isMobile={isMobile}
      />
    </div>
  )
}
