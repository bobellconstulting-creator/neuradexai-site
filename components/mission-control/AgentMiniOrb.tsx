'use client'

/**
 * AgentMiniOrb — small per-agent status orb for the Mission Control left rail.
 *
 * 60×60px canvas. Single sphere with emissive material.
 * Status variants:
 *   online     → full agent color
 *   idle       → 50% dimmed agent color
 *   offline    → #1e3a5f dim steel blue
 *   processing → rapid pulse of agent color
 *
 * Fallback: if WebGL context creation fails, renders a CSS glow div.
 * No postprocessing — intentionally lightweight for 4 simultaneous instances.
 * Emissive intensity stays well above bloom threshold on the parent canvas.
 *
 * Agent colors pulled from lib/agents.ts registry:
 *   doc    → #E5A84A (amber)
 *   linda  → #A78BFA (violet)
 *   marcus → #22C55E (green)
 *   vault  → #B8923A (bronze)
 */

import { useRef, useState, useCallback, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentId     = 'doc' | 'linda' | 'marcus' | 'vault'
export type AgentStatus = 'online' | 'idle' | 'offline' | 'processing'

export interface AgentMiniOrbProps {
  agentId: AgentId
  status:  AgentStatus
}

// ─── Color registry (mirrors lib/agents.ts) ──────────────────────────────────

const AGENT_COLORS: Record<AgentId, string> = {
  doc:    '#E5A84A',
  linda:  '#A78BFA',
  marcus: '#22C55E',
  vault:  '#B8923A',
}

function resolveColor(agentId: AgentId, status: AgentStatus): string {
  if (status === 'offline') return '#1e3a5f'
  return AGENT_COLORS[agentId]
}

// Hex → dim version: parse RGB, multiply by 0.5
function dimColor(hex: string): string {
  const c = new THREE.Color(hex)
  return `rgb(${Math.round(c.r * 127)}, ${Math.round(c.g * 127)}, ${Math.round(c.b * 127)})`
}

// ─── Inner R3F sphere ─────────────────────────────────────────────────────────

interface MiniSphereProps {
  agentId: AgentId
  status:  AgentStatus
}

function MiniSphere({ agentId, status }: MiniSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  const baseColor  = resolveColor(agentId, status)
  const colorObj   = useMemo(() => new THREE.Color(baseColor), [baseColor])
  const dimColorObj = useMemo(() => new THREE.Color(baseColor).multiplyScalar(0.5), [baseColor])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    const t   = clock.getElapsedTime()

    switch (status) {
      case 'online': {
        // Gentle slow pulse
        const pulse = Math.sin(t * 1.4) * 0.5 + 0.5
        mat.emissiveIntensity = 2.8 + pulse * 0.8
        break
      }
      case 'idle': {
        // Slow dim breathe
        const breath = Math.sin(t * 0.6) * 0.5 + 0.5
        mat.emissiveIntensity = 1.2 + breath * 0.4
        // Dim emissive color
        mat.emissive.set(dimColorObj)
        break
      }
      case 'processing': {
        // Rapid strong pulse
        const pulse = Math.sin(t * 6.0) * 0.5 + 0.5
        mat.emissiveIntensity = 3.5 + pulse * 2.5
        // Also scale slightly
        const s = 1.0 + pulse * 0.12
        meshRef.current.scale.setScalar(s)
        break
      }
      case 'offline': {
        mat.emissiveIntensity = 0.4
        break
      }
    }
  })

  // Set initial emissive color from the resolved color string
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.55, 16, 16]} />
      <meshStandardMaterial
        color="#000010"
        emissive={colorObj}
        emissiveIntensity={status === 'offline' ? 0.4 : 2.8}
        toneMapped={false}
      />
    </mesh>
  )
}

// ─── CSS glow fallback (no WebGL) ────────────────────────────────────────────

function CssGlowFallback({ agentId, status }: AgentMiniOrbProps) {
  const baseColor = resolveColor(agentId, status)
  const glowColor = status === 'idle' ? dimColor(baseColor) : baseColor

  return (
    <div
      style={{
        width:        60,
        height:       60,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexShrink:   0,
      }}
      aria-label={`${agentId} ${status}`}
      role="img"
    >
      <div
        style={{
          width:        22,
          height:       22,
          borderRadius: '50%',
          background:   status === 'offline' ? '#1e3a5f' : glowColor,
          boxShadow:    status === 'offline'
            ? 'none'
            : `0 0 8px 3px ${glowColor}, 0 0 18px 6px ${glowColor}40`,
          opacity:      status === 'idle' ? 0.55 : 1,
          animation:    status === 'processing'
            ? 'agentMiniPulse 0.35s ease-in-out infinite alternate'
            : status === 'online'
            ? 'agentMiniBreath 2s ease-in-out infinite alternate'
            : 'none',
        }}
      />
      <style>{`
        @keyframes agentMiniPulse {
          from { transform: scale(0.85); opacity: 0.7; }
          to   { transform: scale(1.15); opacity: 1.0; }
        }
        @keyframes agentMiniBreath {
          from { box-shadow: 0 0 6px 2px ${glowColor}80; }
          to   { box-shadow: 0 0 12px 5px ${glowColor}; }
        }
      `}</style>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function AgentMiniOrb({ agentId, status }: AgentMiniOrbProps) {
  const [webglFailed, setWebglFailed] = useState(false)

  const handleCreated = useCallback(() => {
    // Canvas created successfully — no-op
  }, [])

  const handleError = useCallback(() => {
    setWebglFailed(true)
  }, [])

  if (webglFailed) {
    return <CssGlowFallback agentId={agentId} status={status} />
  }

  return (
    <div
      style={{ width: 60, height: 60, flexShrink: 0 }}
      aria-label={`${agentId} ${status}`}
      role="img"
    >
      <Canvas
        camera={{ position: [0, 0, 2.2], fov: 42 }}
        gl={{ antialias: false, alpha: true }}
        style={{ width: '100%', height: '100%' }}
        onCreated={handleCreated}
        // R3F surfaces canvas errors via onError on the containing div — catch via boundary
        onError={handleError as unknown as React.ReactEventHandler<HTMLDivElement>}
      >
        <ambientLight intensity={0.05} />
        <MiniSphere agentId={agentId} status={status} />
      </Canvas>
    </div>
  )
}
