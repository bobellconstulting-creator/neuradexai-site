'use client'

/**
 * FloatingOrbGraph — 3D force-directed dependency graph for the codebase.
 * Root node: custom THREE.js orb group (inner sphere + outer glow + radial lines).
 * Other nodes: color-coded geometries by type (folder, file, function, class, import).
 * Links: cyan neon lines.
 * Dynamic import avoids SSR issues with react-force-graph-3d.
 */

import type React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import * as THREE from 'three'
import type { NodeObject, LinkObject, ForceGraphProps } from 'react-force-graph-3d'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  name: string
  type: 'root' | 'folder' | 'file' | 'function' | 'class' | 'import'
  path?: string
  size?: number
  color?: string   // search-override color injected at runtime
}

export interface GraphLink {
  source: string
  target: string
  type?: 'import' | 'dependency'
}

export interface FloatingOrbGraphProps {
  className?: string
  projectPath?: string
  width?: number
  height?: number
}

// Internal alias for NodeObject without custom generics (matches what dynamic() exposes)
type RawNode = NodeObject
type RawLink = LinkObject

// ── Constants ──────────────────────────────────────────────────────────────

const BG_COLOR = '#070d1a'
const CYAN     = '#00c8ff'
const BLUE     = '#1a6fff'
const GREEN    = '#00ff88'
const DIM      = '#1e3a5f'
const AMBER    = '#ffb700'

const NODE_COLORS: Record<GraphNode['type'], string> = {
  root:     CYAN,
  folder:   BLUE,
  file:     CYAN,
  function: GREEN,
  class:    GREEN,
  import:   DIM,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function asGraphNode(node: RawNode): GraphNode {
  return node as unknown as GraphNode
}

// ── Node size accessor ─────────────────────────────────────────────────────

function nodeVal(raw: RawNode): number {
  const t = asGraphNode(raw).type
  if (t === 'root')   return 12
  if (t === 'folder') return 6
  if (t === 'file')   return 4
  return 2
}

// ── Root orb builder ───────────────────────────────────────────────────────

function buildRootOrb(): THREE.Group {
  const group = new THREE.Group()

  // Inner solid sphere
  const innerGeo = new THREE.SphereGeometry(8, 24, 24)
  const innerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(CYAN),
    transparent: true,
    opacity: 0.55,
    toneMapped: false,
  })
  group.add(new THREE.Mesh(innerGeo, innerMat))

  // Outer glow sphere (BackSide, very low opacity)
  const outerGeo = new THREE.SphereGeometry(14, 24, 24)
  const outerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(BLUE),
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.12,
    toneMapped: false,
  })
  group.add(new THREE.Mesh(outerGeo, outerMat))

  // 8 radial lines extending outward
  const lineLength = 28
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const points = [
      new THREE.Vector3(Math.cos(angle) * 10, Math.sin(angle) * 10, 0),
      new THREE.Vector3(Math.cos(angle) * lineLength, Math.sin(angle) * lineLength, 0),
    ]
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(CYAN),
      transparent: true,
      opacity: Math.max(0.05, 0.3 - i * 0.025),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    group.add(new THREE.Line(lineGeo, lineMat))
  }

  return group
}

// ── Per-type node builder ──────────────────────────────────────────────────

function buildNodeObject(raw: RawNode): THREE.Object3D {
  const gn = asGraphNode(raw)

  if (gn.type === 'root') {
    return buildRootOrb()
  }

  const colorStr = gn.color ?? NODE_COLORS[gn.type] ?? DIM
  const color    = new THREE.Color(colorStr)

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  let geo: THREE.BufferGeometry

  if (gn.type === 'folder') {
    geo = new THREE.IcosahedronGeometry(4, 0)
  } else if (gn.type === 'file') {
    const ext = gn.path?.split('.').pop() ?? ''
    if (ext === 'ts' || ext === 'tsx') {
      geo = new THREE.OctahedronGeometry(3, 0)
    } else {
      geo = new THREE.SphereGeometry(3, 6, 6)
    }
  } else {
    // function / class / import
    geo = new THREE.TetrahedronGeometry(2.5, 0)
  }

  return new THREE.Mesh(geo, mat)
}

// ── Dynamic import of ForceGraph3D ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as React.ComponentType<ForceGraphProps>

// ── Tooltip state ──────────────────────────────────────────────────────────

interface TooltipState {
  x: number
  y: number
  name: string
  path?: string
}

type GData = { nodes: GraphNode[]; links: GraphLink[] }

// ── Main component ─────────────────────────────────────────────────────────

export default function FloatingOrbGraph({
  className,
  projectPath = 'neuradexai',
  width = 800,
  height = 600,
}: FloatingOrbGraphProps) {
  const [rawData, setRawData]     = useState<GData>({ nodes: [], links: [] })
  const [graphData, setGraphData] = useState<GData>({ nodes: [], links: [] })
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [tooltip, setTooltip]     = useState<TooltipState | null>(null)
  const containerRef              = useRef<HTMLDivElement>(null)
  const animFrameRef              = useRef<number | null>(null)
  const rootOrbRef                = useRef<THREE.Group | null>(null)

  // Fetch graph data
  useEffect(() => {
    setLoading(true)
    void fetch('/api/graph')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<GData>
      })
      .then((data) => {
        setRawData(data)
        setGraphData(data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load graph')
      })
      .finally(() => setLoading(false))
  }, [projectPath])

  // Search filter — highlight matches in amber, dim non-matches
  useEffect(() => {
    if (!search.trim()) {
      setGraphData(rawData)
      return
    }
    const q = search.toLowerCase()
    const updated: GData = {
      links: rawData.links,
      nodes: rawData.nodes.map((n) => ({
        ...n,
        color: n.name.toLowerCase().includes(q) ? AMBER : DIM,
      })),
    }
    setGraphData(updated)
  }, [search, rawData])

  // Animate root orb rotation via rAF
  useEffect(() => {
    let running = true
    const tick = () => {
      if (!running) return
      if (rootOrbRef.current) {
        rootOrbRef.current.rotation.y += 0.008
        rootOrbRef.current.rotation.x += 0.003
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // nodeThreeObject — build custom mesh, cache root orb ref
  const nodeThreeObject = useCallback((raw: RawNode): THREE.Object3D => {
    const obj = buildNodeObject(raw)
    if (asGraphNode(raw).type === 'root' && obj instanceof THREE.Group) {
      rootOrbRef.current = obj
    }
    return obj
  }, [])

  // nodeColor accessor
  const nodeColor = useCallback((raw: RawNode): string => {
    const gn = asGraphNode(raw)
    return gn.color ?? NODE_COLORS[gn.type] ?? DIM
  }, [])

  // nodeVal accessor
  const nodeValCb = useCallback((raw: RawNode): number => nodeVal(raw), [])

  // nodeLabel accessor
  const nodeLabel = useCallback((raw: RawNode): string => {
    const gn = asGraphNode(raw)
    return gn.path ? `${gn.name} — ${gn.path}` : gn.name
  }, [])

  // linkColor accessor
  const linkColor = useCallback((_link: RawLink): string => BLUE, [])

  // Node click — open VS Code for file/folder
  const onNodeClick = useCallback((raw: RawNode) => {
    const gn = asGraphNode(raw)
    if (gn.path && (gn.type === 'file' || gn.type === 'folder')) {
      window.open(`vscode://file/${gn.path}`)
    }
  }, [])

  // Node hover — update tooltip content
  const onNodeHover = useCallback((raw: RawNode | null) => {
    if (!raw) {
      setTooltip(null)
      return
    }
    const gn = asGraphNode(raw)
    setTooltip((prev) => ({
      x: prev?.x ?? 0,
      y: prev?.y ?? 0,
      name: gn.name,
      path: gn.path,
    }))
  }, [])

  // Mouse move — update tooltip xy position
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setTooltip((prev) =>
      prev ? { ...prev, x: e.nativeEvent.offsetX + 14, y: e.nativeEvent.offsetY + 14 } : null
    )
  }, [])

  const matchCount = search.trim()
    ? graphData.nodes.filter((n) => n.color === AMBER).length
    : 0

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width, height, background: BG_COLOR, overflow: 'hidden' }}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Search bar */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <input
          type="text"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: 'rgba(7,13,26,0.85)',
            border: `1px solid ${BLUE}`,
            borderRadius: 4,
            color: CYAN,
            padding: '4px 10px',
            fontSize: 12,
            fontFamily: 'monospace',
            outline: 'none',
            width: 200,
            backdropFilter: 'blur(4px)',
          }}
        />
        {search && (
          <span style={{ color: AMBER, fontSize: 11, fontFamily: 'monospace' }}>
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: CYAN,
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: '0.1em',
          zIndex: 20,
        }}>
          <span style={{ animation: 'pulse 1.4s ease-in-out infinite' }}>
            INITIALIZING GRAPH…
          </span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff3366',
          fontFamily: 'monospace',
          fontSize: 13,
          zIndex: 20,
        }}>
          GRAPH ERROR: {error}
        </div>
      )}

      {/* Force graph canvas */}
      {!loading && !error && (
        <ForceGraph3D
          graphData={graphData}
          width={width}
          height={height}
          backgroundColor={BG_COLOR}
          nodeVal={nodeValCb}
          nodeColor={nodeColor}
          nodeLabel={nodeLabel}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={linkColor}
          linkWidth={0.5}
          linkOpacity={0.4}
          enableNavigationControls
          onNodeHover={onNodeHover}
          onNodeClick={onNodeClick}
          warmupTicks={60}
          cooldownTime={4000}
        />
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y,
          background: 'rgba(7,13,26,0.92)',
          border: `1px solid ${CYAN}`,
          borderRadius: 4,
          padding: '6px 10px',
          color: CYAN,
          fontFamily: 'monospace',
          fontSize: 11,
          pointerEvents: 'none',
          zIndex: 30,
          maxWidth: 280,
          backdropFilter: 'blur(6px)',
        }}>
          <div style={{ fontWeight: 700 }}>{tooltip.name}</div>
          {tooltip.path && (
            <div style={{ color: '#5ef0ff', opacity: 0.75, marginTop: 2, wordBreak: 'break-all' }}>
              {tooltip.path}
            </div>
          )}
        </div>
      )}

      {/* Pulse keyframe for loading spinner */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
