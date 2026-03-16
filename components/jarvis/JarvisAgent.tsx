'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { JarvisAgent } from './jarvisData'

const STATUS_COLOR: Record<string, string> = {
  idle:       '#3B82F6',
  processing: '#22C55E',
  speaking:   '#00FFFF',
  alert:      '#FF4444',
}

interface Props {
  agent: JarvisAgent
  position: [number, number, number]
  isSelected: boolean
  hasAnySelection: boolean
  onSelect: (id: string) => void
  floatOffset: number
}

export default function JarvisAgentNode({
  agent,
  position,
  isSelected,
  hasAnySelection,
  onSelect,
  floatOffset,
}: Props) {
  const groupRef  = useRef<THREE.Group>(null)
  const coreRef   = useRef<THREE.Mesh>(null)
  const innerRef  = useRef<THREE.Mesh>(null)
  const ring1Ref  = useRef<THREE.Mesh>(null)
  const ring2Ref  = useRef<THREE.Mesh>(null)
  const statusRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const t           = useRef(floatOffset)
  const opacityRef  = useRef(1.0)
  const currentY    = useRef(position[1])

  const targetOpacity = hasAnySelection && !isSelected ? 0.12 : 1.0

  useFrame((_, delta) => {
    t.current += delta
    opacityRef.current += (targetOpacity - opacityRef.current) * delta * 5
    const op = opacityRef.current

    const targetY = position[1] + Math.sin(t.current * 0.65) * 0.18 + (hovered ? 0.2 : 0)
    currentY.current += (targetY - currentY.current) * delta * 6
    if (groupRef.current) groupRef.current.position.y = currentY.current

    if (coreRef.current) {
      coreRef.current.rotation.y += delta * 0.7
      coreRef.current.rotation.x += delta * 0.35
      const mat = coreRef.current.material as THREE.MeshStandardMaterial
      const isActive = isSelected || agent.status === 'speaking'
      mat.emissiveIntensity = (isActive ? 3.0 : 0.9) * op
      mat.opacity = 0.85 * op
    }

    if (innerRef.current) {
      const mat = innerRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = 0.28 * op
      mat.emissiveIntensity = (isSelected ? 3.5 : 1.2) * op
    }

    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += delta * (agent.status === 'processing' ? 2.8 : 1.3)
      const mat = ring1Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.72 * op
    }

    if (ring2Ref.current) {
      ring2Ref.current.rotation.x += delta * -0.95
      ring2Ref.current.rotation.z += delta * 0.4
      const mat = ring2Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.5 * op
    }

    if (statusRef.current) {
      if (agent.status === 'speaking') {
        const pulse = 1 + Math.sin(t.current * 5) * 0.28
        statusRef.current.scale.setScalar(pulse)
      }
      const mat = statusRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.92 * op
    }
  })

  const statusColor = STATUS_COLOR[agent.status] ?? '#3B82F6'

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1], position[2]]}
      onClick={(e) => { e.stopPropagation(); onSelect(agent.id) }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
    >
      {/* Inner glow sphere */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial
          color="#00D4FF"
          emissive="#00D4FF"
          emissiveIntensity={1.2}
          transparent
          opacity={0.28}
        />
      </mesh>

      {/* Core — wireframe icosahedron */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial
          color="#00D4FF"
          emissive="#00D4FF"
          emissiveIntensity={0.9}
          wireframe
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Orbit ring 1 */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.013, 8, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.72} />
      </mesh>

      {/* Orbit ring 2 */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 4, Math.PI / 5, 0]}>
        <torusGeometry args={[0.58, 0.008, 8, 64]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.5} />
      </mesh>

      {/* Status ring (base) */}
      <mesh ref={statusRef} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.65, 0]}>
        <torusGeometry args={[0.3, 0.022, 8, 48]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.92} />
      </mesh>

      {/* Selection highlight ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <torusGeometry args={[0.75, 0.005, 8, 64]} />
          <meshBasicMaterial color="#FF8C00" transparent opacity={0.65} />
        </mesh>
      )}

      {/* Hover glow dot */}
      {hovered && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.55, 8, 8]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.04} />
        </mesh>
      )}

      {/* Agent label */}
      <Text
        position={[0, -0.9, 0]}
        fontSize={0.13}
        color={isSelected ? '#FF8C00' : '#00D4FF'}
        anchorX="center"
        anchorY="top"
        renderOrder={10}
      >
        {agent.label}
      </Text>

      {/* Role */}
      <Text
        position={[0, -1.1, 0]}
        fontSize={0.082}
        color="#4FC3F7"
        anchorX="center"
        anchorY="top"
        renderOrder={10}
      >
        {agent.role}
      </Text>
    </group>
  )
}
