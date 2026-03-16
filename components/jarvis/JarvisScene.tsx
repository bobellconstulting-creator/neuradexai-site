'use client'

import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import HoloFloor from './HoloFloor'
import ArcReactor from './ArcReactor'
import JarvisAgentNode from './JarvisAgent'
import ParticleField from './ParticleField'
import type { JarvisAgent } from './jarvisData'

// Large atmospheric halo rings slowly orbiting the room
function AtmosRings() {
  const r1 = useRef<THREE.Mesh>(null)
  const r2 = useRef<THREE.Mesh>(null)
  const r3 = useRef<THREE.Mesh>(null)
  const r4 = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (r1.current) r1.current.rotation.y += delta * 0.055
    if (r2.current) r2.current.rotation.y -= delta * 0.038
    if (r3.current) r3.current.rotation.y += delta * 0.08
    if (r4.current) r4.current.rotation.y -= delta * 0.025
  })

  return (
    <group>
      <mesh ref={r1} rotation={[Math.PI / 2 + 0.12, 0, 0]} position={[0, 1.0, 0]}>
        <torusGeometry args={[6.8, 0.006, 8, 128]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.07} />
      </mesh>
      <mesh ref={r2} rotation={[Math.PI / 2 - 0.18, 0.12, 0]} position={[0, 2.5, 0]}>
        <torusGeometry args={[6.2, 0.009, 8, 128]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.055} />
      </mesh>
      <mesh ref={r3} rotation={[Math.PI / 2 + 0.06, -0.1, 0]} position={[0, 4.2, 0]}>
        <torusGeometry args={[5.2, 0.005, 8, 128]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.04} />
      </mesh>
      <mesh ref={r4} rotation={[Math.PI / 2 - 0.08, 0.08, 0]} position={[0, 6.0, 0]}>
        <torusGeometry args={[3.8, 0.004, 8, 128]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.03} />
      </mesh>
    </group>
  )
}

// Pulsing energy beams from center arc reactor to each agent
function EnergyBeams({ agents }: { agents: JarvisAgent[] }) {
  const total = agents.length
  return (
    <>
      {agents.map((agent, i) => {
        const angle  = (i / total) * Math.PI * 2 - Math.PI / 2
        const radius = 3.5
        const ax = Math.cos(angle) * radius
        const az = Math.sin(angle) * radius
        return (
          <Line
            key={agent.id}
            points={[
              [0, 2.4, 0] as [number, number, number],
              [ax, 0.5, az] as [number, number, number],
            ]}
            color="#00D4FF"
            lineWidth={0.6}
            transparent
            opacity={0.1}
          />
        )
      })}
    </>
  )
}

// Vertical "column" light shafts at room corners
function LightShafts() {
  const positions: [number, number, number][] = [
    [-7, 4, -7], [7, 4, -7], [-7, 4, 7], [7, 4, 7],
  ]
  return (
    <>
      {positions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <cylinderGeometry args={[0.02, 0.02, 8, 6]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.04} />
        </mesh>
      ))}
    </>
  )
}

function agentPosition(index: number, total: number): [number, number, number] {
  const angle  = (index / total) * Math.PI * 2 - Math.PI / 2
  const radius = 3.5
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
}

interface JarvisSceneProps {
  agents: JarvisAgent[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
}

export default function JarvisScene({ agents, selectedAgentId, onSelectAgent }: JarvisSceneProps) {
  const hasSelection = selectedAgentId !== null

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={false}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onPointerMissed={() => {
          if (hasSelection) onSelectAgent(selectedAgentId!)
        }}
      >
        <Suspense fallback={null}>
          {/* Camera */}
          <PerspectiveCamera makeDefault fov={55} position={[0, 7.5, 14]} />

          {/* Orbit controls — auto-rotate, no pan, limited angles */}
          <OrbitControls
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.38}
            minPolarAngle={Math.PI / 7}
            maxPolarAngle={Math.PI / 2.15}
            minDistance={7}
            maxDistance={22}
            target={[0, 1.2, 0]}
          />

          {/* Atmospheric fog */}
          <fog attach="fog" color="#000A1A" near={20} far={40} />

          {/* Lighting */}
          <ambientLight intensity={0.06} color="#001833" />
          <pointLight position={[0, 14, 0]}   color="#00D4FF" intensity={1.5} distance={28} />
          <pointLight position={[-8, 5, -8]}  color="#4FC3F7" intensity={0.7} distance={18} />
          <pointLight position={[8, 5, 8]}    color="#4FC3F7" intensity={0.7} distance={18} />
          <pointLight position={[0, 1, 0]}    color="#001833" intensity={0.5} distance={5} />

          {/* Scene elements */}
          <HoloFloor />
          <ArcReactor />
          <AtmosRings />
          <ParticleField />
          <LightShafts />
          <EnergyBeams agents={agents} />

          {/* Agent nodes */}
          {agents.map((agent, i) => (
            <JarvisAgentNode
              key={agent.id}
              agent={agent}
              position={agentPosition(i, agents.length)}
              isSelected={agent.id === selectedAgentId}
              hasAnySelection={hasSelection}
              onSelect={onSelectAgent}
              floatOffset={i * ((Math.PI * 2) / agents.length)}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* Scanline atmosphere overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 212, 255, 0.007) 2px, rgba(0, 212, 255, 0.007) 4px)',
        }}
      />
    </div>
  )
}
