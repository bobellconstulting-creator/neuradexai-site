'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function HoloFloor() {
  const scanRef = useRef<THREE.Group>(null)

  const grid = useMemo(() => {
    const g = new THREE.GridHelper(32, 64, new THREE.Color('#001840'), new THREE.Color('#000D28'))
    const mats = Array.isArray(g.material) ? g.material : [g.material]
    mats.forEach(m => {
      m.transparent = true
      ;(m as THREE.LineBasicMaterial).opacity = 0.22
    })
    return g
  }, [])

  useFrame((_, delta) => {
    if (scanRef.current) {
      scanRef.current.rotation.y += delta * 0.48
    }
  })

  return (
    <group>
      {/* Dark glass floor disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[8.5, 80]} />
        <meshBasicMaterial color="#000C1E" transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>

      {/* Grid */}
      <primitive object={grid} position={[0, 0.001, 0]} />

      {/* Concentric rings */}
      {[1.5, 2.8, 4.2, 5.8, 7.5].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <ringGeometry args={[r - 0.018, r + 0.018, 80]} />
          <meshBasicMaterial
            color="#00D4FF"
            transparent
            opacity={0.08 + i * 0.022}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Outer bright boundary ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[7.45, 7.6, 80]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>

      {/* Center marker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[0.04, 0.1, 32]} />
        <meshBasicMaterial color="#FF8C00" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Radar scan group — rotates slowly */}
      <group ref={scanRef} position={[0, 0.004, 0]}>
        {/* Sector sweep */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 7.4, 80, 1, 0, Math.PI * 0.3]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.045} side={THREE.DoubleSide} />
        </mesh>
        {/* Bright leading edge */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 7.4, 80, 1, Math.PI * 0.28, Math.PI * 0.025]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Cross hairs */}
      {[0, Math.PI / 2].map((rot, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, rot]} position={[0, 0.004, 0]}>
          <planeGeometry args={[15, 0.007]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.055} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Diagonal accent lines */}
      {[Math.PI / 4, -Math.PI / 4].map((rot, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, rot]} position={[0, 0.004, 0]}>
          <planeGeometry args={[15, 0.004]} />
          <meshBasicMaterial color="#00D4FF" transparent opacity={0.03} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}
