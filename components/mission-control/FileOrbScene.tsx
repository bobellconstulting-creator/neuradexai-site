'use client'

/**
 * FileOrbScene — satellite file orbs that orbit the central fleet orb.
 * Extends FleetOrb visually: renders the fleet core plus orbiting file orbs.
 *
 * File orb colors:
 *   image → #9b6dff purple
 *   pdf   → #ffb700 amber
 *   text  → #00c8ff cyan
 *
 * Each orb orbits at a unique radius (1.8 + index*0.3) and speed on a
 * slightly tilted plane so they don't all lie flat.
 *
 * Spawn animation: new orbs fly from center to orbit position in 1.5s.
 * Dismiss animation: shrink to zero in 0.8s then unmount.
 *
 * Labels: @react-three/drei Text component (drei v9 ships it).
 * Click: calls onFileOrbClick(id).
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { OrbErrorBoundary } from './OrbErrorBoundary'
import type { FleetHealth } from './FleetOrb'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileOrbType = 'image' | 'pdf' | 'text'

export interface FileOrbData {
  id:    string
  name:  string
  type:  FileOrbType
  color: string  // overridable; defaults derived from type below
}

export interface FileOrbSceneProps {
  fleetHealth:      FleetHealth
  activeAgentCount: number
  isProcessing:     boolean
  fileOrbs:         FileOrbData[]
  onFileOrbClick:   (id: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<FleetHealth, string> = {
  allOnline: '#1a6fff',
  degraded:  '#ffb700',
  incident:  '#ff3b3b',
}

const HEALTH_COLORS_DIM: Record<FleetHealth, string> = {
  allOnline: '#0d3a6b',
  degraded:  '#7a5500',
  incident:  '#7a1a1a',
}

const FILE_TYPE_COLORS: Record<FileOrbType, string> = {
  image: '#9b6dff',
  pdf:   '#ffb700',
  text:  '#00c8ff',
}

// Per-orb tilt angle — asymmetric so orbits feel organic
const PLANE_TILTS = [0, 0.28, -0.18, 0.44, -0.35, 0.15, -0.5, 0.22]

// Orbit speeds (radians/second) — slight variation keeps them from syncing
const ORBIT_SPEEDS = [0.38, 0.31, 0.42, 0.27, 0.36, 0.45, 0.29, 0.40]

// ─── Central orb (mirrors FleetOrb layers, same visual) ──────────────────────

interface CentralOrbProps {
  fleetHealth: FleetHealth
  isProcessing: boolean
}

function CentralOrb({ fleetHealth, isProcessing }: CentralOrbProps) {
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const coreRef  = useRef<THREE.Mesh>(null)
  const torusRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  const color    = HEALTH_COLORS[fleetHealth]
  const dimColor = HEALTH_COLORS_DIM[fleetHealth]
  const colorObj = useMemo(() => new THREE.Color(color), [color])

  useFrame(({ clock }) => {
    const t     = clock.getElapsedTime()
    const speed = isProcessing ? 2.0 : 1.0
    const pulse = Math.sin(t * speed * 1.8) * 0.5 + 0.5

    if (outerRef.current) {
      outerRef.current.rotation.x = t * 0.22
      outerRef.current.rotation.y = t * 0.31
    }

    if (innerRef.current) {
      innerRef.current.rotation.x = -t * 0.18
      innerRef.current.rotation.z =  t * 0.28
      const mat = innerRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isProcessing ? 2.5 + pulse * 2.0 : 1.8 + pulse * 0.8
    }

    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isProcessing ? 4.0 + pulse * 3.0 : 3.0 + pulse * 1.2
      mat.emissive.set(colorObj)
    }

    if (torusRef.current) {
      torusRef.current.rotation.z = t * (Math.PI * 2 / 20)
      torusRef.current.rotation.x = Math.sin(t * 0.4) * 0.2 + 0.3
    }

    if (lightRef.current) {
      lightRef.current.color.set(colorObj)
      lightRef.current.intensity = isProcessing ? 1.2 + pulse * 1.5 : 0.8 + pulse * 0.5
    }
  })

  return (
    <group>
      <pointLight ref={lightRef} position={[0, 0, 0]} intensity={0.8} distance={6} decay={2} />

      <mesh ref={outerRef}>
        <icosahedronGeometry args={[0.62, 2]} />
        <meshBasicMaterial
          color={color} wireframe transparent opacity={0.45}
          blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
        />
      </mesh>

      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial
          color="#000010" emissive={color} emissiveIntensity={1.8}
          transparent opacity={0.4} wireframe
          toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>

      <mesh ref={coreRef}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial
          color="#000018" emissive={color} emissiveIntensity={3.0} toneMapped={false}
        />
      </mesh>

      <mesh ref={torusRef} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.82, 0.01, 8, 80]} />
        <meshBasicMaterial
          color={dimColor} wireframe transparent opacity={0.6}
          blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// ─── Individual file orb ──────────────────────────────────────────────────────

interface SpawnedFileOrb extends FileOrbData {
  spawnTime:    number   // clock time when orb was added
  dismissTime:  number | null  // clock time when dismiss was called, null if alive
  orbitIndex:   number   // determines radius, speed, tilt
  orbitPhase:   number   // initial angle offset so orbs don't stack
}

interface FileOrbMeshProps {
  data:        SpawnedFileOrb
  onPointerUp: (id: string) => void
}

function FileOrbMesh({ data, onPointerUp }: FileOrbMeshProps) {
  const meshRef  = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const labelRef = useRef<THREE.Object3D>(null)

  const orbColor  = data.color || FILE_TYPE_COLORS[data.type]
  const colorObj  = useMemo(() => new THREE.Color(orbColor), [orbColor])

  const orbitRadius = 1.8 + data.orbitIndex * 0.3
  const orbitSpeed  = ORBIT_SPEEDS[data.orbitIndex % ORBIT_SPEEDS.length]
  const planeTilt   = PLANE_TILTS[data.orbitIndex % PLANE_TILTS.length]

  const SPAWN_DURATION   = 1.5
  const DISMISS_DURATION = 0.8

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshRef.current) return

    const now       = clock.getElapsedTime()
    const age       = now - data.spawnTime

    // ── Scale animation ────────────────────────────────────────────────────
    let scale = 1.0
    let opacity = 1.0

    if (data.dismissTime !== null) {
      // Shrink out
      const dismissAge = now - data.dismissTime
      const t = Math.min(dismissAge / DISMISS_DURATION, 1.0)
      scale   = 1.0 - t
      opacity = 1.0 - t
    } else if (age < SPAWN_DURATION) {
      // Fly outward from center: ease out cubic
      const t = age / SPAWN_DURATION
      const eased = 1 - Math.pow(1 - t, 3)
      scale = eased
    }

    // ── Orbit position ─────────────────────────────────────────────────────
    const angle  = data.orbitPhase + now * orbitSpeed
    // Ellipse: slightly squished on Y for organic feel
    const x = Math.cos(angle) * orbitRadius
    const y = Math.sin(angle) * orbitRadius * 0.72 * Math.cos(planeTilt)
    const z = Math.sin(angle) * orbitRadius * Math.sin(planeTilt)

    groupRef.current.position.set(x, y, z)
    groupRef.current.scale.setScalar(scale)

    // ── Emissive pulse ─────────────────────────────────────────────────────
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    const pulse = Math.sin(now * 2.2 + data.orbitPhase) * 0.5 + 0.5
    mat.emissiveIntensity = 2.5 + pulse * 1.2
    mat.emissive.set(colorObj)
    mat.opacity = opacity

    // Keep label facing camera — billboard
    if (labelRef.current) {
      labelRef.current.position.y = -0.22
    }
  })

  const handlePointerUp = useCallback(() => {
    onPointerUp(data.id)
  }, [data.id, onPointerUp])

  return (
    <group ref={groupRef}>
      {/* Wireframe outer shell */}
      <mesh>
        <icosahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial
          color={orbColor} wireframe transparent opacity={0.6}
          blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
        />
      </mesh>

      {/* Solid emissive core */}
      <mesh
        ref={meshRef}
        onPointerUp={handlePointerUp}
      >
        <sphereGeometry args={[0.10, 10, 10]} />
        <meshStandardMaterial
          color="#000010"
          emissive={orbColor}
          emissiveIntensity={2.5}
          toneMapped={false}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Label */}
      <object3D ref={labelRef} position={[0, -0.22, 0]}>
        <Text
          fontSize={0.07}
          color={orbColor}
          anchorX="center"
          anchorY="top"
          maxWidth={0.8}
          outlineWidth={0.004}
          outlineColor="#000018"
          // @ts-expect-error — drei Text material props
          toneMapped={false}
        >
          {data.name.length > 12 ? data.name.slice(0, 11) + '…' : data.name}
        </Text>
      </object3D>
    </group>
  )
}

// ─── ClickProxy: translates R3F pointer events to real coords ─────────────────
// (unused directly — handled per-mesh above)

// ─── Scene root ───────────────────────────────────────────────────────────────

interface FileOrbSceneRootProps {
  fleetHealth:    FleetHealth
  isProcessing:   boolean
  spawnedOrbs:    SpawnedFileOrb[]
  onOrbClick:     (id: string) => void
}

function FileOrbSceneRoot({
  fleetHealth,
  isProcessing,
  spawnedOrbs,
  onOrbClick,
}: FileOrbSceneRootProps) {
  return (
    <>
      <ambientLight intensity={0.04} />
      <CentralOrb fleetHealth={fleetHealth} isProcessing={isProcessing} />

      {spawnedOrbs.map((orb) => (
        <FileOrbMesh
          key={orb.id}
          data={orb}
          onPointerUp={onOrbClick}
        />
      ))}

      <EffectComposer>
        <Bloom
          intensity={1.5}
          luminanceThreshold={0.14}
          luminanceSmoothing={0.82}
          height={300}
        />
      </EffectComposer>
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function FileOrbScene({
  fleetHealth,
  activeAgentCount,
  isProcessing,
  fileOrbs,
  onFileOrbClick,
}: FileOrbSceneProps) {
  // Manage internal spawned orb list with spawn/dismiss timestamps
  const [spawnedOrbs, setSpawnedOrbs] = useState<SpawnedFileOrb[]>([])

  // Sync incoming fileOrbs → spawnedOrbs
  // New id: create SpawnedFileOrb with spawnTime=now, dismissTime=null
  // Removed id: set dismissTime=now, then remove after 0.8s
  const prevIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const currentIds = new Set(fileOrbs.map((o) => o.id))
    const now = performance.now() / 1000

    setSpawnedOrbs((prev) => {
      // Mark removed orbs for dismiss — immutable update, no mutation of prev elements
      const next = prev.map((orb) =>
        !currentIds.has(orb.id) && orb.dismissTime === null
          ? { ...orb, dismissTime: now }
          : orb
      )

      // Add new orbs
      fileOrbs.forEach((orb, rawIndex) => {
        if (!prevIdsRef.current.has(orb.id)) {
          const orbIndex = next.filter((o) => o.dismissTime === null).length
          const spawned: SpawnedFileOrb = {
            ...orb,
            color:       orb.color || FILE_TYPE_COLORS[orb.type],
            spawnTime:   now,
            dismissTime: null,
            orbitIndex:  orbIndex,
            orbitPhase:  rawIndex * (Math.PI * 2 / Math.max(fileOrbs.length, 1)) +
                         rawIndex * 0.37,
          }
          next.push(spawned)
        }
      })

      prevIdsRef.current = currentIds
      return next
    })
  }, [fileOrbs])

  // Clean up fully dismissed orbs after animation completes
  useEffect(() => {
    const DISMISS_DURATION_MS = 900
    const timer = setInterval(() => {
      const cutoff = performance.now() / 1000 - DISMISS_DURATION_MS / 1000
      setSpawnedOrbs((prev) => prev.filter(
        (o) => o.dismissTime === null || o.dismissTime > cutoff
      ))
    }, 500)
    return () => clearInterval(timer)
  }, [])

  return (
    <OrbErrorBoundary label="FILE-ORB-SCENE">
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 500, aspectRatio: '1 / 1' }}
        aria-label={`Fleet orb with ${fileOrbs.length} file orbs. Fleet health: ${fleetHealth}.`}
        role="img"
      >
        <Canvas
          camera={{ position: [0, 0, 4.5], fov: 48 }}
          gl={{ antialias: true, alpha: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <FileOrbSceneRoot
            fleetHealth={fleetHealth}
            isProcessing={isProcessing}
            spawnedOrbs={spawnedOrbs}
            onOrbClick={onFileOrbClick}
          />
        </Canvas>

        {/* Agent count badge — bottom center */}
        {activeAgentCount > 0 && (
          <div
            style={{
              position:      'absolute',
              bottom:        10,
              left:          '50%',
              transform:     'translateX(-50%)',
              fontFamily:    'JetBrains Mono, ui-monospace, monospace',
              fontSize:      9,
              letterSpacing: '0.2em',
              color:         HEALTH_COLORS[fleetHealth],
              pointerEvents: 'none',
              userSelect:    'none',
              opacity:       0.8,
            }}
          >
            {fileOrbs.length > 0
              ? `${fileOrbs.length} FILE${fileOrbs.length === 1 ? '' : 'S'} · ${activeAgentCount} AGENT${activeAgentCount === 1 ? '' : 'S'}`
              : `${activeAgentCount} AGENT${activeAgentCount === 1 ? '' : 'S'} ACTIVE`
            }
          </div>
        )}
      </div>
    </OrbErrorBoundary>
  )
}
