'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Torus } from '@react-three/drei'
import * as THREE from 'three'

interface CoreLogoProps {
  hasSelection: boolean
}

export default function CoreLogo({ hasSelection }: CoreLogoProps) {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const tRef = useRef(0)

  useFrame((_, delta) => {
    tRef.current += delta
    const t = tRef.current

    if (!groupRef.current) return

    // Float oscillation
    groupRef.current.position.y = 1.2 + Math.sin(t * 0.8) * 0.15

    // Continuous Y rotation
    groupRef.current.rotation.y = t * 0.4

    // Shift X when agent selected
    const targetX = hasSelection ? -1.5 : 0
    groupRef.current.position.x += (targetX - groupRef.current.position.x) * delta * 3

    // Pulse ring scale
    if (ringRef.current) {
      const pulse = 1 + Math.sin(t * 2.5) * 0.08
      ringRef.current.scale.setScalar(pulse)
    }
    if (ring2Ref.current) {
      const pulse2 = 1 + Math.sin(t * 2.5 + Math.PI) * 0.06
      ring2Ref.current.scale.setScalar(pulse2)
    }
  })

  return (
    <group ref={groupRef} position={[0, 1.2, 0]}>
      {/* "N" glyph */}
      <Text
        fontSize={0.6}
        color="#00F2FF"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        N
        <meshStandardMaterial
          color="#00F2FF"
          emissive="#00F2FF"
          emissiveIntensity={0.6}
        />
      </Text>

      {/* Pulse ring 1 */}
      <Torus ref={ringRef} args={[0.55, 0.012, 16, 64]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#00F2FF" transparent opacity={0.8} />
      </Torus>

      {/* Pulse ring 2 (outer) */}
      <Torus ref={ring2Ref} args={[0.75, 0.006, 16, 64]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#00F2FF" transparent opacity={0.35} />
      </Torus>
    </group>
  )
}
