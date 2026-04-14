'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

const BRASS = '#efb356'
const BRASS_DIM = '#c47e1a'

export function CommandCore() {
  const groupRef = useRef<THREE.Group>(null!)
  const shellMatRef = useRef<any>(null)
  const ring1Ref = useRef<THREE.Mesh>(null!)
  const ring2Ref = useRef<THREE.Mesh>(null!)
  const ring3Ref = useRef<THREE.Mesh>(null!)

  useFrame((_, dt) => {
    const t = performance.now() * 0.001
    groupRef.current.rotation.y += dt * 0.12
    const breath = 1 + Math.sin(t * 0.8) * 0.04
    groupRef.current.scale.setScalar(breath)

    if (shellMatRef.current) {
      shellMatRef.current.distort = 0.22 + Math.sin(t * 1.1) * 0.04
      shellMatRef.current.emissiveIntensity = 1.8 + Math.sin(t * 0.7) * 0.3
    }
    if (ring1Ref.current) ring1Ref.current.rotation.z += dt * 0.28
    if (ring2Ref.current) ring2Ref.current.rotation.x -= dt * 0.19
    if (ring3Ref.current) {
      ring3Ref.current.rotation.y += dt * 0.22
      ring3Ref.current.rotation.z += dt * 0.1
    }
  })

  const RADIUS = 1.05

  return (
    <group ref={groupRef} position={[0, 0.5, 0]}>
      {/* Outer brass wireframe shell */}
      <mesh>
        <icosahedronGeometry args={[RADIUS, 4]} />
        <MeshDistortMaterial
          ref={shellMatRef}
          color="#1a0e00"
          emissive={BRASS}
          emissiveIntensity={1.8}
          distort={0.22}
          speed={1.8}
          toneMapped={false}
          wireframe
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Inner ghost shell */}
      <mesh scale={0.75}>
        <icosahedronGeometry args={[RADIUS, 3]} />
        <meshBasicMaterial
          color={BRASS_DIM}
          transparent
          opacity={0.22}
          wireframe
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Core glow — bloom anchor */}
      <mesh scale={0.38}>
        <sphereGeometry args={[RADIUS, 20, 20]} />
        <meshBasicMaterial
          color={BRASS}
          transparent
          opacity={0.95}
          toneMapped={false}
        />
      </mesh>

      {/* Dense particle crown */}
      <Sparkles count={60} scale={RADIUS * 4.2} size={2.8} speed={0.35} color={BRASS} />

      {/* Three orbital rings at distinct angles */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS * 1.55, 0.014, 4, 120]} />
        <meshBasicMaterial
          color={BRASS}
          transparent
          opacity={0.6}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={ring2Ref} rotation={[Math.PI / 2.5, 0, Math.PI / 6]}>
        <torusGeometry args={[RADIUS * 1.8, 0.009, 4, 120]} />
        <meshBasicMaterial
          color={BRASS_DIM}
          transparent
          opacity={0.4}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={ring3Ref} rotation={[Math.PI / 3.5, Math.PI / 7, 0]}>
        <torusGeometry args={[RADIUS * 2.1, 0.007, 4, 120]} />
        <meshBasicMaterial
          color={BRASS}
          transparent
          opacity={0.28}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
