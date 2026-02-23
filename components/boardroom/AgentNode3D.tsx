'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Torus } from '@react-three/drei'
import * as THREE from 'three'
import type { Agent } from '@/components/boardroom/boardroomData'

const STATUS_COLORS: Record<string, string> = {
  idle:       '#3B82F6',
  processing: '#22C55E',
  speaking:   '#00F2FF',
}

interface AgentNode3DProps {
  agent: Agent
  position: [number, number, number]
  isSelected: boolean
  hasAnySelection: boolean
  onSelect: (id: string) => void
}

export default function AgentNode3D({
  agent,
  position,
  isSelected,
  hasAnySelection,
  onSelect,
}: AgentNode3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const headRef = useRef<THREE.Mesh>(null)
  const bodyRef = useRef<THREE.Mesh>(null)
  const shoulderRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const tRef = useRef(Math.random() * Math.PI * 2)
  const currentYRef = useRef(position[1])
  const currentOpacityRef = useRef(1.0)

  const targetOpacity = hasAnySelection && !isSelected ? 0.2 : 1.0

  useFrame((_, delta) => {
    tRef.current += delta

    // Lerp opacity
    currentOpacityRef.current += (targetOpacity - currentOpacityRef.current) * delta * 4
    const op = currentOpacityRef.current

    const applyOpacity = (mesh: THREE.Mesh | null, base: number) => {
      if (!mesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = base * op
    }
    applyOpacity(headRef.current, 0.9)
    applyOpacity(bodyRef.current, 0.85)
    applyOpacity(shoulderRef.current, 0.7)

    // Hover lift
    const targetY = position[1] + (hovered ? 0.15 : 0)
    currentYRef.current += (targetY - currentYRef.current) * delta * 8
    if (groupRef.current) {
      groupRef.current.position.y = currentYRef.current
    }

    // Speaking ring pulse
    if (ringRef.current && agent.status === 'speaking') {
      const pulse = 1 + Math.sin(tRef.current * 4) * 0.2
      ringRef.current.scale.setScalar(pulse)
    }
  })

  const statusColor = STATUS_COLORS[agent.status] ?? '#3B82F6'

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1], position[2]]}
      onClick={(e) => { e.stopPropagation(); onSelect(agent.id) }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Head */}
      <mesh ref={headRef} position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color="#00F2FF" wireframe transparent opacity={0.9} />
      </mesh>

      {/* Body */}
      <mesh ref={bodyRef} position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.42, 8]} />
        <meshBasicMaterial color="#00F2FF" wireframe transparent opacity={0.85} />
      </mesh>

      {/* Shoulder bar */}
      <mesh ref={shoulderRef} position={[0, 0.38, 0]}>
        <boxGeometry args={[0.38, 0.04, 0.08]} />
        <meshBasicMaterial color="#00F2FF" wireframe transparent opacity={0.7} />
      </mesh>

      {/* Status ring */}
      <mesh
        ref={ringRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -0.06, 0]}
      >
        <torusGeometry args={[0.22, 0.022, 8, 32]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.95} />
      </mesh>

      {/* Agent label */}
      <Text
        position={[0, -0.24, 0]}
        fontSize={0.1}
        color={isSelected ? '#00F2FF' : '#94a3b8'}
        anchorX="center"
        anchorY="top"
        renderOrder={10}
      >
        {agent.label}
      </Text>
    </group>
  )
}
