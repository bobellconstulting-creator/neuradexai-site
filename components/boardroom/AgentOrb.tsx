'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Sparkles, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { AgentConfig } from '@/lib/agents'

export type OrbState = 'idle' | 'thinking' | 'alert' | 'offline'

interface AgentOrbProps {
  agent: AgentConfig
  state: OrbState
  position: [number, number, number]
  radius?: number
  onClick?: () => void
  hovered?: boolean
  onHoverIn?: () => void
  onHoverOut?: () => void
}

export function AgentOrb({
  agent,
  state,
  position,
  radius = 0.55,
  onClick,
  hovered = false,
  onHoverIn,
  onHoverOut,
}: AgentOrbProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const shellMatRef = useRef<any>(null)
  const ringRef1 = useRef<THREE.Mesh>(null!)
  const ringRef2 = useRef<THREE.Mesh>(null!)

  const { breathSpeed, distortBase, emissiveBase } = useMemo(() => {
    switch (state) {
      case 'thinking': return { breathSpeed: 3.5, distortBase: 0.38, emissiveBase: 2.6 }
      case 'alert':    return { breathSpeed: 2.0, distortBase: 0.28, emissiveBase: 1.9 }
      case 'offline':  return { breathSpeed: 0.0, distortBase: 0.08, emissiveBase: 0.3 }
      default:         return { breathSpeed: 0.9, distortBase: 0.18, emissiveBase: 1.3 }
    }
  }, [state])

  useFrame((_, dt) => {
    const t = performance.now() * 0.001
    const breath = 1 + Math.sin(t * breathSpeed) * (state === 'thinking' ? 0.09 : 0.04)
    groupRef.current.scale.setScalar(breath + (hovered ? 0.06 : 0))
    groupRef.current.rotation.y += dt * (state === 'thinking' ? 0.55 : 0.2)

    if (shellMatRef.current) {
      shellMatRef.current.emissiveIntensity = emissiveBase
      shellMatRef.current.distort = distortBase
    }
    if (ringRef1.current) ringRef1.current.rotation.z += dt * 0.5
    if (ringRef2.current) ringRef2.current.rotation.x -= dt * 0.35
  })

  const color = agent.color
  const accent = agent.accent

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={(e) => { e.stopPropagation(); onClick?.() }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        onHoverIn?.()
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
        onHoverOut?.()
      }}
    >
      {/* Outer wireframe shell — emissive, caught by bloom */}
      <mesh>
        <icosahedronGeometry args={[radius, 4]} />
        <MeshDistortMaterial
          ref={shellMatRef}
          color="#050d18"
          emissive={color}
          emissiveIntensity={emissiveBase}
          distort={distortBase}
          speed={2.2}
          toneMapped={false}
          wireframe
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Inner ghost shell — depth layer */}
      <mesh scale={0.76}>
        <icosahedronGeometry args={[radius, 3]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.18}
          wireframe
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Core glow sphere — bloom anchor */}
      <mesh scale={0.32}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </mesh>

      {/* Particle cloud */}
      <Sparkles
        count={state === 'thinking' ? 28 : 14}
        scale={radius * 3.5}
        size={state === 'thinking' ? 2.4 : 1.4}
        speed={state === 'thinking' ? 0.7 : 0.25}
        color={color}
      />

      {/* Counter-rotating orbit rings */}
      <mesh ref={ringRef1} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[radius * 1.45, 0.010, 4, 80]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ringRef2} rotation={[Math.PI / 1.7, 0, Math.PI / 5]}>
        <torusGeometry args={[radius * 1.65, 0.007, 4, 80]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.35}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Alert ring — red halo when blocked */}
      {state === 'alert' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 1.9, 0.022, 4, 80]} />
          <meshBasicMaterial
            color="#ff3366"
            transparent
            opacity={0.92}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Label via drei Html — always shows, brightens on hover */}
      <Html
        center
        position={[0, -(radius + 0.32), 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        distanceFactor={6}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          minWidth: 80,
        }}>
          <span style={{
            fontFamily: "'Share Tech Mono', monospace, monospace",
            fontSize: 11,
            letterSpacing: '0.15em',
            fontWeight: 600,
            color: hovered ? '#ffffff' : color,
            textShadow: `0 0 8px ${color}`,
            transition: 'color 0.2s',
            whiteSpace: 'nowrap',
          }}>
            {agent.label}
          </span>
          {hovered && (
            <span style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              letterSpacing: '0.08em',
              color: 'rgba(184,244,255,0.55)',
              whiteSpace: 'nowrap',
            }}>
              {agent.role.toUpperCase()}
            </span>
          )}
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: state === 'alert'
              ? '#ff3366'
              : state === 'thinking'
                ? color
                : 'rgba(184,244,255,0.3)',
            boxShadow: state !== 'idle' ? `0 0 6px ${state === 'alert' ? '#ff3366' : color}` : 'none',
          }} />
        </div>
      </Html>
    </group>
  )
}
