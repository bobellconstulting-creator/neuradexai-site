'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function ArcReactor() {
  const groupRef = useRef<THREE.Group>(null)
  const r1 = useRef<THREE.Mesh>(null)
  const r2 = useRef<THREE.Mesh>(null)
  const r3 = useRef<THREE.Mesh>(null)
  const r4 = useRef<THREE.Mesh>(null)
  const r5 = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta

    if (groupRef.current) {
      groupRef.current.position.y = 2.4 + Math.sin(t.current * 0.55) * 0.22
    }

    // Ring orbits — each at different speed & axis
    if (r1.current) r1.current.rotation.z += delta * 1.5
    if (r2.current) r2.current.rotation.x += delta * -1.15
    if (r3.current) r3.current.rotation.y += delta * 0.85
    if (r4.current) r4.current.rotation.z += delta * -0.65
    if (r5.current) {
      r5.current.rotation.x += delta * 0.4
      r5.current.rotation.y += delta * 0.3
    }

    // Pulsing point light
    if (lightRef.current) {
      lightRef.current.intensity = 4 + Math.sin(t.current * 2.4) * 1.5
    }
  })

  return (
    <group ref={groupRef} position={[0, 2.4, 0]}>
      {/* Central pulsing light */}
      <pointLight ref={lightRef} color="#00D4FF" intensity={4} distance={14} decay={2} />

      {/* Inner solid core */}
      <mesh>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color="#00D4FF" emissive="#00D4FF" emissiveIntensity={8} />
      </mesh>

      {/* Core halo (inner glow) */}
      <mesh>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial
          color="#00D4FF"
          emissive="#00D4FF"
          emissiveIntensity={3}
          transparent
          opacity={0.1}
        />
      </mesh>

      {/* Outer soft halo */}
      <mesh>
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshStandardMaterial
          color="#4FC3F7"
          emissive="#4FC3F7"
          emissiveIntensity={1}
          transparent
          opacity={0.04}
        />
      </mesh>

      {/* Ring 1 — horizontal */}
      <mesh ref={r1} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.016, 8, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.95} />
      </mesh>

      {/* Ring 2 — vertical */}
      <mesh ref={r2}>
        <torusGeometry args={[0.57, 0.012, 8, 64]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.78} />
      </mesh>

      {/* Ring 3 — 45° tilt */}
      <mesh ref={r3} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[0.62, 0.009, 8, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.58} />
      </mesh>

      {/* Ring 4 — oblique */}
      <mesh ref={r4} rotation={[0, Math.PI / 4, Math.PI / 4]}>
        <torusGeometry args={[0.68, 0.006, 8, 64]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.42} />
      </mesh>

      {/* Ring 5 — large outer halo ring */}
      <mesh ref={r5} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.3, 0.003, 8, 128]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.2} />
      </mesh>

      {/* Vertical energy pillar (beam going up) */}
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 8, 6]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.1} />
      </mesh>

      {/* Down beam */}
      <mesh position={[0, -1.5, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 3, 6]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.06} />
      </mesh>
    </group>
  )
}
