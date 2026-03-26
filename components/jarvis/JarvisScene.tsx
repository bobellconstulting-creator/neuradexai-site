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

// ── Atmospheric halo rings ────────────────────────────────────────────────────
function AtmosRings({ audioLevel, isSpeaking }: { audioLevel?: React.MutableRefObject<number>, isSpeaking?: boolean }) {
  const refs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)]
  const mats = [useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null)]

  useFrame((_, delta) => {
    const a = audioLevel?.current ?? 0
    const spd = isSpeaking ? 1 + a * 3 : 1
    if (refs[0].current) refs[0].current.rotation.y += delta * 0.055 * spd
    if (refs[1].current) refs[1].current.rotation.y -= delta * 0.038 * spd
    if (refs[2].current) refs[2].current.rotation.y += delta * 0.08 * spd
    if (refs[3].current) refs[3].current.rotation.y -= delta * 0.025 * spd
    if (refs[4].current) { refs[4].current.rotation.y += delta * 0.12 * spd; refs[4].current.rotation.x += delta * 0.04 }
    if (refs[5].current) refs[5].current.rotation.y -= delta * 0.07 * spd
    // Pulse opacity with audio
    mats.forEach((m, i) => {
      if (m.current) {
        const base = [0.07, 0.055, 0.04, 0.03, 0.035, 0.025][i]
        m.current.opacity = base + (isSpeaking ? a * 0.15 : 0)
      }
    })
  })

  return (
    <group>
      <mesh ref={refs[0]} rotation={[Math.PI / 2 + 0.12, 0, 0]} position={[0, 1.0, 0]}>
        <torusGeometry args={[6.8, 0.007, 8, 128]} />
        <meshBasicMaterial ref={mats[0]} color="#00D4FF" transparent opacity={0.07} />
      </mesh>
      <mesh ref={refs[1]} rotation={[Math.PI / 2 - 0.18, 0.12, 0]} position={[0, 2.5, 0]}>
        <torusGeometry args={[6.2, 0.01, 8, 128]} />
        <meshBasicMaterial ref={mats[1]} color="#4FC3F7" transparent opacity={0.055} />
      </mesh>
      <mesh ref={refs[2]} rotation={[Math.PI / 2 + 0.06, -0.1, 0]} position={[0, 4.2, 0]}>
        <torusGeometry args={[5.2, 0.006, 8, 128]} />
        <meshBasicMaterial ref={mats[2]} color="#00D4FF" transparent opacity={0.04} />
      </mesh>
      <mesh ref={refs[3]} rotation={[Math.PI / 2 - 0.08, 0.08, 0]} position={[0, 6.0, 0]}>
        <torusGeometry args={[3.8, 0.005, 8, 128]} />
        <meshBasicMaterial ref={mats[3]} color="#4FC3F7" transparent opacity={0.03} />
      </mesh>
      {/* Extra rings for 20x effect */}
      <mesh ref={refs[4]} rotation={[0.3, 0, 0.5]} position={[0, 3.0, 0]}>
        <torusGeometry args={[7.5, 0.004, 8, 128]} />
        <meshBasicMaterial ref={mats[4]} color="#00D4FF" transparent opacity={0.035} />
      </mesh>
      <mesh ref={refs[5]} rotation={[Math.PI / 2 + 0.5, 0.3, 0]} position={[0, 5.0, 0]}>
        <torusGeometry args={[4.5, 0.004, 8, 128]} />
        <meshBasicMaterial ref={mats[5]} color="#6dd5fa" transparent opacity={0.025} />
      </mesh>
    </group>
  )
}

// ── Audio waveform ring around the reactor ────────────────────────────────────
function VoiceWaveRing({ audioLevel, isSpeaking }: { audioLevel?: React.MutableRefObject<number>, isSpeaking?: boolean }) {
  const SEGMENTS = 64
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef  = useRef<THREE.MeshBasicMaterial>(null)
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    const a = audioLevel?.current ?? 0
    if (meshRef.current) {
      const scale = isSpeaking ? 1 + a * 0.5 + Math.sin(t.current * 8) * a * 0.2 : 1
      meshRef.current.scale.setScalar(scale)
      meshRef.current.rotation.z += delta * (isSpeaking ? 0.5 + a * 2 : 0.1)
    }
    if (matRef.current) {
      matRef.current.opacity = isSpeaking ? 0.3 + a * 0.5 : 0.08
    }
  })

  return (
    <mesh ref={meshRef} position={[0, 2.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1.8, 0.008, 8, 80]} />
      <meshBasicMaterial ref={matRef} color="#00D4FF" transparent opacity={0.08} />
    </mesh>
  )
}

// ── Holographic equalization bars that rise with voice ────────────────────────
function EqBars({ audioLevel, isSpeaking }: { audioLevel?: React.MutableRefObject<number>, isSpeaking?: boolean }) {
  const COUNT = 24
  const refs = Array.from({ length: COUNT }, () => useRef<THREE.Mesh>(null))
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    const a = audioLevel?.current ?? 0
    refs.forEach((ref, i) => {
      if (!ref.current) return
      const angle = (i / COUNT) * Math.PI * 2
      const noise = Math.sin(t.current * 3 + i * 0.7) * 0.5 + 0.5
      const height = isSpeaking ? 0.05 + a * 1.8 * noise + Math.sin(t.current * 6 + i) * a * 0.3 : 0.02 + Math.sin(t.current * 0.5 + i) * 0.01
      ref.current.scale.y = height
      ref.current.position.y = 2.4 + height / 2
    })
  })

  return (
    <>
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2
        const r = 2.2
        return (
          <mesh key={i} ref={refs[i]} position={[Math.cos(angle) * r, 2.4, Math.sin(angle) * r]}>
            <boxGeometry args={[0.04, 1, 0.04]} />
            <meshBasicMaterial color="#00D4FF" transparent opacity={0.35} />
          </mesh>
        )
      })}
    </>
  )
}

// ── Scanning sonar sweep ──────────────────────────────────────────────────────
function SonarSweep() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.4
  })
  return (
    <mesh ref={ref} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0, 9, 64, 1, 0, Math.PI * 0.18]} />
      <meshBasicMaterial color="#00D4FF" transparent opacity={0.04} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ── Holographic grid floor lines ──────────────────────────────────────────────
function HoloGrid() {
  const LINES = 12
  const SIZE = 9
  const lines: [number, number, number][][] = []
  for (let i = 0; i <= LINES; i++) {
    const x = -SIZE + (i / LINES) * SIZE * 2
    lines.push([[x, 0.02, -SIZE], [x, 0.02, SIZE]])
    lines.push([[-SIZE, 0.02, x], [SIZE, 0.02, x]])
  }
  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts as [number,number,number][]} color="#00D4FF" lineWidth={0.3} transparent opacity={0.04} />
      ))}
    </>
  )
}

// ── Animated energy beams that pulse with audio ───────────────────────────────
function EnergyBeams({ agents, audioLevel, isSpeaking }: { agents: JarvisAgent[], audioLevel?: React.MutableRefObject<number>, isSpeaking?: boolean }) {
  const matRefs = agents.map(() => useRef<THREE.LineBasicMaterial>(null))
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    const a = audioLevel?.current ?? 0
    matRefs.forEach((ref, i) => {
      if (ref.current) {
        const pulse = Math.sin(t.current * 2 + i * 0.8) * 0.5 + 0.5
        ref.current.opacity = isSpeaking ? 0.1 + a * 0.4 * pulse : 0.06 + pulse * 0.04
      }
    })
  })

  const total = agents.length
  return (
    <>
      {agents.map((agent, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2
        const ax = Math.cos(angle) * 3.5
        const az = Math.sin(angle) * 3.5
        return (
          <Line key={agent.id}
            points={[[0, 2.4, 0], [ax, 0.5, az]] as [number,number,number][]}
            color="#00D4FF" lineWidth={0.8} transparent opacity={0.1}
          />
        )
      })}
    </>
  )
}

// ── Vertical corner light shafts ──────────────────────────────────────────────
function LightShafts() {
  const positions: [number, number, number][] = [[-7, 4, -7], [7, 4, -7], [-7, 4, 7], [7, 4, 7], [-5, 6, 0], [5, 6, 0], [0, 6, -5], [0, 6, 5]]
  return (
    <>
      {positions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <cylinderGeometry args={[0.015, 0.015, 10, 6]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.03} />
        </mesh>
      ))}
    </>
  )
}

function agentPosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return [Math.cos(angle) * 3.5, 0, Math.sin(angle) * 3.5]
}

interface JarvisSceneProps {
  agents: JarvisAgent[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  audioLevel?: React.MutableRefObject<number>
  isSpeaking?: boolean
  isThinking?: boolean
}

export default function JarvisScene({ agents, selectedAgentId, onSelectAgent, audioLevel, isSpeaking, isThinking }: JarvisSceneProps) {
  const hasSelection = selectedAgentId !== null

  return (
    <div className="absolute inset-0">
      <Canvas shadows={false} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent' }}
        onPointerMissed={() => { if (hasSelection) onSelectAgent(selectedAgentId!) }}>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault fov={52} position={[0, 7.5, 13]} />
          <OrbitControls enablePan={false} autoRotate autoRotateSpeed={isSpeaking ? 0.7 : 0.38}
            minPolarAngle={Math.PI / 7} maxPolarAngle={Math.PI / 2.15}
            minDistance={7} maxDistance={22} target={[0, 1.2, 0]} />

          <fog attach="fog" color="#000810" near={18} far={38} />

          {/* Lighting — more dynamic */}
          <ambientLight intensity={0.05} color="#000d1a" />
          <pointLight position={[0, 14, 0]}  color="#00D4FF" intensity={isSpeaking ? 3.5 : 1.5} distance={30} />
          <pointLight position={[-8, 5, -8]} color="#4FC3F7" intensity={0.8} distance={20} />
          <pointLight position={[8, 5, 8]}   color="#4FC3F7" intensity={0.8} distance={20} />
          <pointLight position={[0, 0, 8]}   color="#001a33" intensity={0.4} distance={10} />
          <pointLight position={[0, 1, 0]}   color="#001833" intensity={0.6} distance={6} />

          {/* Scene */}
          <HoloFloor />
          <HoloGrid />
          <SonarSweep />
          <ArcReactor audioLevel={audioLevel} isSpeaking={isSpeaking} isThinking={isThinking} />
          <VoiceWaveRing audioLevel={audioLevel} isSpeaking={isSpeaking} />
          <EqBars audioLevel={audioLevel} isSpeaking={isSpeaking} />
          <AtmosRings audioLevel={audioLevel} isSpeaking={isSpeaking} />
          <ParticleField />
          <LightShafts />
          <EnergyBeams agents={agents} audioLevel={audioLevel} isSpeaking={isSpeaking} />

          {agents.map((agent, i) => (
            <JarvisAgentNode key={agent.id} agent={agent}
              position={agentPosition(i, agents.length)}
              isSelected={agent.id === selectedAgentId}
              hasAnySelection={hasSelection}
              onSelect={onSelectAgent}
              floatOffset={i * ((Math.PI * 2) / agents.length)} />
          ))}
        </Suspense>
      </Canvas>

      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,212,255,0.006) 2px,rgba(0,212,255,0.006) 4px)',
      }} />
    </div>
  )
}
