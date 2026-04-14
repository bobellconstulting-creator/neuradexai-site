'use client'

/**
 * AgentOrbScene — 4-agent wireframe icosahedrons orbiting a center point.
 * Loaded lazily (ssr: false) by FileDropzone and AmbientOrb. Kept intentionally
 * lightweight so it doesn't tank FPS alongside RadarSweep. No heavy postprocessing
 * here — just a single low-intensity Bloom pass.
 *
 * audioLevel (0..1) drives emissive intensity, scale, and core glow reactively.
 * Smoothed internally via lerp so the visual never jitters on fast mic input.
 */

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// Positions of the 4 agent orbs (square formation, flat z plane)
const ORB_POSITIONS: [number, number, number][] = [
  [-0.9,  0.7, 0],  // Doc   — top-left
  [ 0.9,  0.7, 0],  // Linda — top-right
  [ 0.9, -0.7, 0],  // Marcus — bottom-right
  [-0.9, -0.7, 0],  // Vault — bottom-left
]

interface OrbProps {
  position: [number, number, number]
  color: string
  phaseOffset: number
  audioLevel: number
}

function Orb({ position, color, phaseOffset, audioLevel }: OrbProps) {
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const coreRef  = useRef<THREE.Mesh>(null)

  // Smoothed audio level — avoids jitter on fast mic input
  const smoothedAudio = useRef(0)

  useFrame(({ clock }) => {
    // Lerp toward target at 0.15 per frame (~9 fps convergence time)
    smoothedAudio.current = THREE.MathUtils.lerp(
      smoothedAudio.current,
      audioLevel,
      0.15
    )
    const sa = smoothedAudio.current

    const t = clock.getElapsedTime() + phaseOffset

    if (outerRef.current) {
      outerRef.current.rotation.x = t * 0.4
      outerRef.current.rotation.y = t * 0.6
      // Gentle bob + audio-driven scale
      outerRef.current.position.y = position[1] + Math.sin(t * 0.9) * 0.06
      const scale = 1.0 + sa * 0.12
      outerRef.current.scale.setScalar(scale)
    }

    if (innerRef.current) {
      innerRef.current.rotation.x = -t * 0.3
      innerRef.current.rotation.z = t * 0.5
      // Audio-reactive emissive intensity on inner ghost shell
      const mat = innerRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 2.2 + sa * 1.5
    }

    if (coreRef.current) {
      // Core glow gets the strongest audio boost
      const mat = coreRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 3.5 + sa * 2.0
    }
  })

  return (
    <group position={position}>
      {/* Outer wireframe shell */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Inner ghost shell — slightly smaller, counter-rotates */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial
          color="#000010"
          emissive={color}
          emissiveIntensity={2.2}
          transparent
          opacity={0.55}
          wireframe
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Solid emissive core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color="#000010"
          emissive={color}
          emissiveIntensity={3.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// Slow orbit — the whole formation rotates on Y axis
function OrbRing({
  colors,
  audioLevel,
}: {
  colors: [string, string, string, string]
  audioLevel: number
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.25
      groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.15) * 0.12
    }
  })

  return (
    <group ref={groupRef}>
      {ORB_POSITIONS.map((pos, i) => (
        <Orb
          key={i}
          position={pos}
          color={colors[i]}
          phaseOffset={i * (Math.PI / 2)}
          audioLevel={audioLevel}
        />
      ))}

      {/* Connecting lines between orbs (dim additive) */}
      {[[0,1],[1,2],[2,3],[3,0],[0,2],[1,3]].map(([a, b], i) => {
        const pa = new THREE.Vector3(...ORB_POSITIONS[a])
        const pb = new THREE.Vector3(...ORB_POSITIONS[b])
        const mid = pa.clone().lerp(pb, 0.5)
        const len = pa.distanceTo(pb)
        const dir = pb.clone().sub(pa).normalize()
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir
        )
        return (
          <mesh key={i} position={mid} quaternion={quaternion}>
            <cylinderGeometry args={[0.003, 0.003, len, 4]} />
            <meshBasicMaterial
              color="#00d4ff"
              transparent
              opacity={0.18}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}

interface AgentOrbSceneProps {
  colors: [string, string, string, string]
  /** 0..1 audio energy level — drives emissive intensity, scale, and core glow.
   *  Defaults to 0 (no audio reactivity). Smoothed internally via lerp. */
  audioLevel?: number
}

export default function AgentOrbScene({ colors, audioLevel = 0 }: AgentOrbSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 42 }}
      gl={{ antialias: false, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Transparent bg — panel shows through */}
      <ambientLight intensity={0.1} />

      <OrbRing colors={colors} audioLevel={audioLevel} />

      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.12}
          luminanceSmoothing={0.85}
          height={200}
        />
      </EffectComposer>
    </Canvas>
  )
}
