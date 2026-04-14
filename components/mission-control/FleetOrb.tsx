'use client'

/**
 * FleetOrb — large central fleet health orb for the Mission Control center column.
 *
 * Color semantics:
 *   allOnline  → #1a6fff blue pulse
 *   degraded   → #ffb700 amber pulse
 *   incident   → #ff3b3b red pulse
 *
 * When isProcessing=true: distortion increases, pulse speed doubles.
 * Wrapped in OrbErrorBoundary so a WebGL crash never takes down the dashboard.
 *
 * Layer stack (non-negotiable rule: never single-sphere):
 *   1. Outer wireframe icosahedron shell — additive blending
 *   2. Inner ghost shell — counter-rotates, emissive
 *   3. Solid emissive core sphere
 *   4. Orbiting torus ring — slow 20s rotation
 *   5. Bloom postprocessing
 */

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { OrbErrorBoundary } from './OrbErrorBoundary'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FleetHealth = 'allOnline' | 'degraded' | 'incident'

export interface FleetOrbProps {
  fleetHealth: FleetHealth
  activeAgentCount: number
  isProcessing: boolean
}

// ─── Color map ───────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<FleetHealth, string> = {
  allOnline: '#1a6fff',
  degraded:  '#ffb700',
  incident:  '#ff3b3b',
}

// Slightly dimmer tone for the outer wireframe so the core reads hotter
const HEALTH_COLORS_DIM: Record<FleetHealth, string> = {
  allOnline: '#0d3a6b',
  degraded:  '#7a5500',
  incident:  '#7a1a1a',
}

// ─── Inner scene ─────────────────────────────────────────────────────────────

interface FleetOrbSceneProps {
  fleetHealth: FleetHealth
  isProcessing: boolean
}

function FleetOrbScene({ fleetHealth, isProcessing }: FleetOrbSceneProps) {
  const outerRef  = useRef<THREE.Mesh>(null)
  const innerRef  = useRef<THREE.Mesh>(null)
  const coreRef   = useRef<THREE.Mesh>(null)
  const torusRef  = useRef<THREE.Mesh>(null)
  const lightRef  = useRef<THREE.PointLight>(null)

  const color    = HEALTH_COLORS[fleetHealth]
  const dimColor = HEALTH_COLORS_DIM[fleetHealth]
  const colorObj = useMemo(() => new THREE.Color(color), [color])

  useFrame(({ clock }) => {
    const t     = clock.getElapsedTime()
    // Processing mode: pulse speed doubles
    const speed = isProcessing ? 2.0 : 1.0
    const pulse = Math.sin(t * speed * 1.8) * 0.5 + 0.5  // 0..1

    // Outer wireframe — slow dual-axis rotation
    if (outerRef.current) {
      outerRef.current.rotation.x = t * 0.22
      outerRef.current.rotation.y = t * 0.31
      const s = 1.0 + (isProcessing ? pulse * 0.08 : pulse * 0.04)
      outerRef.current.scale.setScalar(s)
    }

    // Inner ghost — counter-rotates for complexity
    if (innerRef.current) {
      innerRef.current.rotation.x = -t * 0.18
      innerRef.current.rotation.z =  t * 0.28
      const mat = innerRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isProcessing
        ? 2.5 + pulse * 2.0
        : 1.8 + pulse * 0.8
    }

    // Core — strongest glow, most reactive
    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isProcessing
        ? 4.0 + pulse * 3.0
        : 3.0 + pulse * 1.2
      mat.emissive.set(colorObj)
    }

    // Orbiting torus — 20s full rotation, slight wobble
    if (torusRef.current) {
      torusRef.current.rotation.z = t * (Math.PI * 2 / 20)
      torusRef.current.rotation.x = Math.sin(t * 0.4) * 0.2 + 0.3
    }

    // Point light pulses with health state
    if (lightRef.current) {
      lightRef.current.color.set(colorObj)
      lightRef.current.intensity = isProcessing
        ? 1.2 + pulse * 1.5
        : 0.8 + pulse * 0.5
    }
  })

  return (
    <>
      <ambientLight intensity={0.05} />
      <pointLight
        ref={lightRef}
        position={[0, 0, 0]}
        intensity={0.8}
        distance={4}
        decay={2}
      />

      {/* Layer 1: Outer wireframe icosahedron shell */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[0.72, 2]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Layer 2: Inner ghost shell — counter-rotates, smaller subdivisions */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.48, 1]} />
        <meshStandardMaterial
          color="#000010"
          emissive={color}
          emissiveIntensity={1.8}
          transparent
          opacity={0.45}
          wireframe
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Layer 3: Solid emissive core — hottest point */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial
          color="#000018"
          emissive={color}
          emissiveIntensity={3.0}
          toneMapped={false}
        />
      </mesh>

      {/* Layer 4: Orbiting torus ring — dim wireframe, 20s rotation */}
      <mesh ref={torusRef} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.95, 0.012, 8, 80]} />
        <meshBasicMaterial
          color={dimColor}
          wireframe
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Second torus at a tilted plane for depth */}
      <mesh rotation={[Math.PI / 2.4, 0.4, 0]}>
        <torusGeometry args={[0.85, 0.008, 6, 64]} />
        <meshBasicMaterial
          color={dimColor}
          wireframe
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.82}
          height={300}
        />
      </EffectComposer>
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function FleetOrb({
  fleetHealth,
  activeAgentCount,
  isProcessing,
}: FleetOrbProps) {
  const color = HEALTH_COLORS[fleetHealth]

  return (
    <OrbErrorBoundary label="FLEET-ORB">
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '1 / 1' }}
        aria-label={`Fleet health: ${fleetHealth}. ${activeAgentCount} agents active.`}
        role="img"
      >
        <Canvas
          camera={{ position: [0, 0, 2.6], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <FleetOrbScene fleetHealth={fleetHealth} isProcessing={isProcessing} />
        </Canvas>

        {/* Status badge overlay — bottom center */}
        <div
          style={{
            position:    'absolute',
            bottom:      12,
            left:        '50%',
            transform:   'translateX(-50%)',
            display:     'flex',
            alignItems:  'center',
            gap:         6,
            pointerEvents: 'none',
            userSelect:  'none',
          }}
        >
          {/* Dot */}
          <span
            style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   color,
              boxShadow:    `0 0 6px 2px ${color}`,
              display:      'inline-block',
              animation:    isProcessing ? 'none' : undefined,
            }}
          />
          <span
            style={{
              fontFamily:    'JetBrains Mono, ui-monospace, monospace',
              fontSize:      9,
              letterSpacing: '0.2em',
              color:         color,
              opacity:       0.9,
            }}
          >
            {fleetHealth === 'allOnline' && 'ALL SYSTEMS NOMINAL'}
            {fleetHealth === 'degraded'  && 'DEGRADED'}
            {fleetHealth === 'incident'  && 'INCIDENT ACTIVE'}
            {' · '}
            {activeAgentCount}
            {activeAgentCount === 1 ? ' AGENT' : ' AGENTS'}
          </span>
        </div>
      </div>
    </OrbErrorBoundary>
  )
}
