'use client'

import { useRef } from 'react'
import { Cylinder, Ring } from '@react-three/drei'
import * as THREE from 'three'

export default function BoardroomFloor() {
  return (
    <group>
      {/* Main glass floor disc */}
      <Cylinder args={[3.2, 3.2, 0.05, 64]} position={[0, -0.03, 0]}>
        <meshPhysicalMaterial
          color="#00F2FF"
          transparent
          opacity={0.08}
          roughness={0}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </Cylinder>

      {/* Concentric grid rings */}
      {[1.0, 1.8, 2.5, 3.2].map((r, i) => (
        <Ring
          key={i}
          args={[r - 0.01, r + 0.01, 64]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        >
          <meshBasicMaterial
            color="#00F2FF"
            transparent
            opacity={0.12 + i * 0.04}
            side={THREE.DoubleSide}
          />
        </Ring>
      ))}

      {/* Outer glow ring */}
      <Ring args={[3.15, 3.25, 64]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <meshBasicMaterial
          color="#00F2FF"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </Ring>

      {/* Center cross hairs */}
      {[0, Math.PI / 2].map((rot, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, rot]} position={[0, 0.001, 0]}>
          <planeGeometry args={[6.4, 0.008]} />
          <meshBasicMaterial color="#00F2FF" transparent opacity={0.08} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}
