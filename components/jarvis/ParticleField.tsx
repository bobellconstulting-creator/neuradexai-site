'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const COUNT = 480

export default function ParticleField() {
  const ref = useRef<THREE.Points>(null)

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const velocities = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const r = Math.random() * 7.2 + 0.8
      const theta = Math.random() * Math.PI * 2
      positions[i * 3]     = Math.cos(theta) * r
      positions[i * 3 + 1] = Math.random() * 6.5
      positions[i * 3 + 2] = Math.sin(theta) * r
      velocities[i] = (Math.random() * 0.35 + 0.08) * (Math.random() > 0.4 ? 1 : -1) * 0.45
    }
    return { positions, velocities }
  }, [])

  useFrame((_, delta) => {
    if (!ref.current) return
    const pos = ref.current.geometry.attributes.position
    const arr = pos.array as Float32Array
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += velocities[i] * delta
      if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = 0.05
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 6.8
    }
    pos.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.024}
        color="#00D4FF"
        transparent
        opacity={0.45}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
