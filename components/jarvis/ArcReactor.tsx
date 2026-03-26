'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface ArcReactorProps {
  audioLevel?: React.MutableRefObject<number>   // 0–1 live audio amplitude
  isSpeaking?: boolean
  isThinking?: boolean
}

export default function ArcReactor({ audioLevel, isSpeaking, isThinking }: ArcReactorProps) {
  const groupRef = useRef<THREE.Group>(null)
  const r1 = useRef<THREE.Mesh>(null)
  const r2 = useRef<THREE.Mesh>(null)
  const r3 = useRef<THREE.Mesh>(null)
  const r4 = useRef<THREE.Mesh>(null)
  const r5 = useRef<THREE.Mesh>(null)
  const lightRef   = useRef<THREE.PointLight>(null)
  const outerLight = useRef<THREE.PointLight>(null)
  const coreMat    = useRef<THREE.MeshStandardMaterial>(null)
  const haloMat    = useRef<THREE.MeshStandardMaterial>(null)
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta

    const audio = audioLevel?.current ?? 0   // 0–1
    const speaking = isSpeaking ?? false
    const thinking = isThinking ?? false

    // Speed multiplier: 1x idle → 3x thinking → 6x speaking + audio boost
    const baseSpeed = thinking ? 2.2 : speaking ? 3.5 : 1.0
    const speedBoost = speaking ? 1 + audio * 4 : 1
    const speed = baseSpeed * speedBoost

    // Vertical float — bigger amplitude when speaking
    const floatAmp = speaking ? 0.32 + audio * 0.4 : thinking ? 0.28 : 0.22
    if (groupRef.current) {
      groupRef.current.position.y = 2.4 + Math.sin(t.current * 0.55) * floatAmp
    }

    // Ring spin speeds
    if (r1.current) r1.current.rotation.z += delta * 1.5 * speed
    if (r2.current) r2.current.rotation.x += delta * -1.15 * speed
    if (r3.current) r3.current.rotation.y += delta * 0.85 * speed
    if (r4.current) r4.current.rotation.z += delta * -0.65 * speed
    if (r5.current) {
      r5.current.rotation.x += delta * 0.4 * speed
      r5.current.rotation.y += delta * 0.3 * speed
      // Scale outer ring with audio
      const outerScale = speaking ? 1 + audio * 0.6 : 1
      r5.current.scale.setScalar(outerScale)
    }

    // Main light intensity — pulse hard with audio when speaking
    if (lightRef.current) {
      const baseIntensity = speaking ? 8 + audio * 12 : thinking ? 5 : 4
      lightRef.current.intensity = baseIntensity + Math.sin(t.current * 2.4) * (speaking ? 2 + audio * 4 : 1.5)
      // Color shifts: cyan when idle, orange when thinking, bright white-cyan when speaking
      const r = thinking ? 1.0 : speaking ? 0.7 + audio * 0.3 : 0.0
      const g = thinking ? 0.45 : 0.83
      const b = 1.0
      lightRef.current.color.setRGB(r, g, b)
    }

    // Outer ambient light
    if (outerLight.current) {
      outerLight.current.intensity = speaking ? 2 + audio * 3 : thinking ? 1.2 : 0.6
    }

    // Core emissive — pulse with audio
    if (coreMat.current) {
      coreMat.current.emissiveIntensity = speaking ? 10 + audio * 16 : thinking ? 7 : 8
      coreMat.current.emissive.setRGB(
        thinking ? 1.0 : 0.0,
        thinking ? 0.55 : 0.83,
        1.0,
      )
    }

    // Halo opacity breathes with audio
    if (haloMat.current) {
      haloMat.current.opacity = speaking ? 0.08 + audio * 0.18 : 0.1
    }
  })

  return (
    <group ref={groupRef} position={[0, 2.4, 0]}>
      {/* Main reactive light */}
      <pointLight ref={lightRef} color="#00D4FF" intensity={4} distance={18} decay={2} />
      {/* Outer fill light */}
      <pointLight ref={outerLight} color="#4FC3F7" intensity={0.6} distance={28} decay={2} />

      {/* Inner solid core */}
      <mesh>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial ref={coreMat} color="#00D4FF" emissive="#00D4FF" emissiveIntensity={8} />
      </mesh>

      {/* Core halo */}
      <mesh>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial
          ref={haloMat}
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
        <meshStandardMaterial color="#4FC3F7" emissive="#4FC3F7" emissiveIntensity={1} transparent opacity={0.04} />
      </mesh>

      {/* Ring 1 */}
      <mesh ref={r1} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.016, 8, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.95} />
      </mesh>

      {/* Ring 2 */}
      <mesh ref={r2}>
        <torusGeometry args={[0.57, 0.012, 8, 64]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.78} />
      </mesh>

      {/* Ring 3 */}
      <mesh ref={r3} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[0.62, 0.009, 8, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.58} />
      </mesh>

      {/* Ring 4 */}
      <mesh ref={r4} rotation={[0, Math.PI / 4, Math.PI / 4]}>
        <torusGeometry args={[0.68, 0.006, 8, 64]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.42} />
      </mesh>

      {/* Ring 5 — large outer, scales with audio */}
      <mesh ref={r5} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.3, 0.003, 8, 128]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.2} />
      </mesh>

      {/* Energy pillar up */}
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 8, 6]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.1} />
      </mesh>

      {/* Energy pillar down */}
      <mesh position={[0, -1.5, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 3, 6]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.06} />
      </mesh>
    </group>
  )
}
