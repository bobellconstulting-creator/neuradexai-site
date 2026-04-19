'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sparkles, MeshDistortMaterial, Line, Html } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VaultNode {
  id: string
  name: string
  type: 'root' | 'folder' | 'file'
  path: string
  folder: string
}

interface VaultLink {
  source: string
  target: string
}

interface VaultGraph {
  nodes: VaultNode[]
  links: VaultLink[]
}

// ── Color palette — tight, intentional ────────────────────────────────────────

const PALETTE = {
  bg:       '#050a14',
  cyan:     '#00e5ff',
  cyanDim:  '#007a99',
  blue:     '#1a6fff',
  magenta:  '#c438f4',
  amber:    '#f4a438',
  green:    '#38f4a4',
  red:      '#f43864',
  teal:     '#38d4f4',
  gold:     '#f4d038',
} as const

// One distinct hue per top-level folder (order matches the vault folders)
const FOLDER_COLORS: string[] = [
  PALETTE.cyan,     // 00-Inbox
  PALETTE.blue,     // 01-Daily
  PALETTE.green,    // 02-Projects
  PALETTE.amber,    // 03-Areas
  PALETTE.teal,     // 04-Resources
  PALETTE.magenta,  // 05-Fleet
  PALETTE.gold,     // 06-People
  PALETTE.red,      // Templates
]

function folderColor(folderName: string, folderNodes: VaultNode[]): string {
  const idx = folderNodes.findIndex((f) => f.name === folderName)
  return FOLDER_COLORS[idx % FOLDER_COLORS.length] ?? PALETTE.cyanDim
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function orbitPosition(
  index: number,
  total: number,
  radius: number,
  yOffset = 0,
  tilt = 0
): THREE.Vector3 {
  const angle = (index / total) * Math.PI * 2
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    yOffset + Math.sin(angle * 0.4) * 0.6,
    Math.sin(angle) * radius * Math.cos(tilt)
  )
}

function fileOrbitPosition(
  fileIndex: number,
  totalFiles: number,
  parentPos: THREE.Vector3,
  orbitRadius: number,
  timeOffset: number
): THREE.Vector3 {
  const angle = (fileIndex / totalFiles) * Math.PI * 2 + timeOffset
  const x = parentPos.x + Math.cos(angle) * orbitRadius
  const z = parentPos.z + Math.sin(angle) * orbitRadius
  const y = parentPos.y + Math.sin(angle * 0.5) * 0.3
  return new THREE.Vector3(x, y, z)
}

// ── Central Nexus Orb ─────────────────────────────────────────────────────────

function NexusOrb() {
  const outerRef  = useRef<THREE.Mesh>(null)
  const innerRef  = useRef<THREE.Mesh>(null)
  const shellRef  = useRef<THREE.Mesh>(null)
  const ringRef   = useRef<THREE.Mesh>(null)
  const time      = useRef(0)

  useFrame((_, delta) => {
    time.current += delta
    const t = time.current

    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.15
      outerRef.current.rotation.x = t * 0.07
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * 0.22
      innerRef.current.rotation.z = t * 0.09
    }
    if (shellRef.current) {
      shellRef.current.rotation.y = t * 0.08
      shellRef.current.rotation.x = t * 0.05
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.12
      ringRef.current.rotation.x = Math.sin(t * 0.3) * 0.15
    }
  })

  return (
    <group>
      {/* Outermost ghost shell — BackSide trick for halo */}
      <mesh ref={shellRef}>
        <sphereGeometry args={[1.55, 32, 32]} />
        <meshStandardMaterial
          color={PALETTE.blue}
          emissive={PALETTE.blue}
          emissiveIntensity={0.6}
          transparent
          opacity={0.04}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>

      {/* Distorting wireframe orb — the hero layer */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[1.3, 3]} />
        <MeshDistortMaterial
          color="#030c1a"
          emissive={PALETTE.cyan}
          emissiveIntensity={1.4}
          distort={0.25}
          speed={1.8}
          wireframe
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>

      {/* Solid inner orb — deep blue core */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.72, 32, 32]} />
        <meshStandardMaterial
          color="#020a18"
          emissive={PALETTE.blue}
          emissiveIntensity={2.2}
          toneMapped={false}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Thin equatorial ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2.5, 0, 0]}>
        <torusGeometry args={[1.35, 0.012, 6, 96]} />
        <meshBasicMaterial
          color={PALETTE.cyan}
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Second ring, tilted */}
      <mesh rotation={[0, Math.PI / 4, Math.PI / 3]}>
        <torusGeometry args={[1.42, 0.007, 6, 96]} />
        <meshBasicMaterial
          color={PALETTE.blue}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Particle cloud */}
      <Sparkles
        count={180}
        scale={3.4}
        size={0.6}
        speed={0.35}
        color={PALETTE.cyan}
        opacity={0.9}
      />

      {/* Secondary particle cloud — blue, denser near center */}
      <Sparkles
        count={80}
        scale={1.8}
        size={0.4}
        speed={0.6}
        color={PALETTE.blue}
        opacity={0.7}
      />
    </group>
  )
}

// ── Folder Node ───────────────────────────────────────────────────────────────

interface FolderNodeProps {
  node: VaultNode
  position: THREE.Vector3
  color: string
  isHovered: boolean
  onHover: (node: VaultNode | null) => void
  onClick: (node: VaultNode) => void
}

function FolderNode({ node, position, color, isHovered, onHover, onClick }: FolderNodeProps) {
  const meshRef  = useRef<THREE.Mesh>(null)
  const wireRef  = useRef<THREE.Mesh>(null)
  const time     = useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    time.current += delta
    if (!meshRef.current || !wireRef.current) return

    const pulse = 1 + Math.sin(time.current * 1.8) * 0.04
    const targetScale = isHovered ? 1.5 * pulse : pulse
    meshRef.current.scale.setScalar(
      THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, 0.08)
    )
    wireRef.current.scale.setScalar(meshRef.current.scale.x * 1.3)
    wireRef.current.rotation.y = time.current * 0.4
    wireRef.current.rotation.x = time.current * 0.25
  })

  const threeColor = useMemo(() => new THREE.Color(color), [color])

  return (
    <group position={position}>
      {/* Wireframe shell */}
      <mesh ref={wireRef}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshBasicMaterial
          color={threeColor}
          wireframe
          transparent
          opacity={isHovered ? 0.9 : 0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Solid core */}
      <mesh
        ref={meshRef}
        onPointerEnter={() => onHover(node)}
        onPointerLeave={() => onHover(null)}
        onClick={() => onClick(node)}
      >
        <octahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial
          color="#030c1a"
          emissive={threeColor}
          emissiveIntensity={isHovered ? 3.0 : 1.8}
          toneMapped={false}
        />
      </mesh>

      {/* Label on hover */}
      {isHovered && (
        <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(5,10,20,0.88)',
            border: `1px solid ${color}`,
            borderRadius: 3,
            padding: '3px 8px',
            color,
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(4px)',
            textShadow: `0 0 8px ${color}`,
          }}>
            {node.name.toUpperCase()}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── File Node ─────────────────────────────────────────────────────────────────

interface FileNodeProps {
  node: VaultNode
  position: THREE.Vector3
  color: string
  isHovered: boolean
  onHover: (node: VaultNode | null) => void
  onClick: (node: VaultNode) => void
}

function FileNode({ node, position, color, isHovered, onHover, onClick }: FileNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const time    = useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    time.current += delta
    if (!meshRef.current) return
    const target = isHovered ? 1.8 : 1.0
    meshRef.current.scale.setScalar(
      THREE.MathUtils.lerp(meshRef.current.scale.x, target, 0.1)
    )
  })

  const threeColor = useMemo(() => new THREE.Color(color), [color])

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerEnter={() => onHover(node)}
        onPointerLeave={() => onHover(null)}
        onClick={() => onClick(node)}
      >
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial
          color="#020810"
          emissive={threeColor}
          emissiveIntensity={isHovered ? 4.0 : 2.2}
          toneMapped={false}
        />
      </mesh>

      {isHovered && (
        <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(5,10,20,0.88)',
            border: `1px solid ${color}`,
            borderRadius: 3,
            padding: '2px 7px',
            color,
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(4px)',
            textShadow: `0 0 6px ${color}`,
          }}>
            {node.name}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Connection lines ──────────────────────────────────────────────────────────

interface ConnectionLineProps {
  start: THREE.Vector3
  end: THREE.Vector3
  color: string
  opacity?: number
}

function ConnectionLine({ start, end, color, opacity = 0.18 }: ConnectionLineProps) {
  const points = useMemo(() => [start, end], [start, end])
  return (
    <Line
      points={points}
      color={color}
      lineWidth={0.6}
      transparent
      opacity={opacity}
      blending={THREE.AdditiveBlending}
      depthWrite={false}
      toneMapped={false}
    />
  )
}

// ── Animated connections — file orbits change over time ───────────────────────

interface AnimatedConnectionsProps {
  folderPositions: Map<string, THREE.Vector3>
  filesByFolder: Map<string, VaultNode[]>
  hoveredId: string | null
  folderColorMap: Map<string, string>
}

function AnimatedConnections({
  folderPositions,
  filesByFolder,
  hoveredId,
  folderColorMap,
}: AnimatedConnectionsProps) {
  const [tick, setTick] = useState(0)

  useFrame((state) => {
    // Update every frame — throttle via modulo to avoid thrashing
    if (Math.floor(state.clock.elapsedTime * 30) !== tick) {
      setTick(Math.floor(state.clock.elapsedTime * 30))
    }
  })

  const lines: JSX.Element[] = []
  const ORIGIN = new THREE.Vector3(0, 0, 0)

  folderPositions.forEach((folderPos, folderId) => {
    const color = folderColorMap.get(folderId) ?? PALETTE.cyanDim
    const isHovered = hoveredId === folderId
    lines.push(
      <ConnectionLine
        key={`root-${folderId}`}
        start={ORIGIN}
        end={folderPos}
        color={color}
        opacity={isHovered ? 0.45 : 0.15}
      />
    )

    const files = filesByFolder.get(folderId) ?? []
    const t = tick / 30
    files.forEach((file, fi) => {
      const filePos = fileOrbitPosition(fi, files.length, folderPos, 0.52, t * 0.18 + (fi * 0.7))
      const isFileHovered = hoveredId === file.id
      lines.push(
        <ConnectionLine
          key={`folder-${file.id}`}
          start={folderPos}
          end={filePos}
          color={color}
          opacity={isFileHovered ? 0.6 : 0.12}
        />
      )
    })
  })

  return <>{lines}</>
}

// ── Static file nodes (positioned via computed layout) ────────────────────────

interface StaticFileNodesProps {
  folderPositions: Map<string, THREE.Vector3>
  filesByFolder: Map<string, VaultNode[]>
  hoveredId: string | null
  onHover: (node: VaultNode | null) => void
  onClick: (node: VaultNode) => void
  folderColorMap: Map<string, string>
}

function FileNodes({
  folderPositions,
  filesByFolder,
  hoveredId,
  onHover,
  onClick,
  folderColorMap,
}: StaticFileNodesProps) {
  const { clock } = useThree()
  const [tick, setTick] = useState(0)

  useFrame(() => {
    const next = Math.floor(clock.elapsedTime * 30)
    if (next !== tick) setTick(next)
  })

  const elements: JSX.Element[] = []
  const t = tick / 30

  folderPositions.forEach((folderPos, folderId) => {
    const color = folderColorMap.get(folderId) ?? PALETTE.cyanDim
    const files = filesByFolder.get(folderId) ?? []
    files.forEach((file, fi) => {
      const pos = fileOrbitPosition(fi, files.length, folderPos, 0.52, t * 0.18 + (fi * 0.7))
      elements.push(
        <FileNode
          key={file.id}
          node={file}
          position={pos}
          color={color}
          isHovered={hoveredId === file.id}
          onHover={onHover}
          onClick={onClick}
        />
      )
    })
  })

  return <>{elements}</>
}

// ── Ambient star field ────────────────────────────────────────────────────────

function StarField() {
  const pointsRef = useRef<THREE.Points>(null)

  const [positions] = useState(() => {
    const count = 400
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 24
      pos[i * 3 + 1] = (Math.random() - 0.5) * 24
      pos[i * 3 + 2] = (Math.random() - 0.5) * 24
    }
    return pos
  })

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.006
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={PALETTE.cyanDim}
        size={0.015}
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}

// ── Camera drift — slow, hypnotic pull ───────────────────────────────────────

function CameraDrift() {
  const { camera } = useThree()
  const time        = useRef(0)

  useFrame((_, delta) => {
    time.current += delta * 0.12
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, Math.sin(time.current) * 0.3, 0.02)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, Math.cos(time.current * 0.7) * 0.2, 0.02)
    camera.lookAt(0, 0, 0)
  })

  return null
}

// ── Main scene graph ──────────────────────────────────────────────────────────

interface SceneProps {
  graph: VaultGraph
  hoveredId: string | null
  onHover: (node: VaultNode | null) => void
  onClick: (node: VaultNode) => void
}

function NexusScene({ graph, hoveredId, onHover, onClick }: SceneProps) {
  const folderNodes  = useMemo(() => graph.nodes.filter((n) => n.type === 'folder'), [graph])
  const fileNodes    = useMemo(() => graph.nodes.filter((n) => n.type === 'file'), [graph])

  // Stable folder positions — evenly distributed on a tilted ring
  const folderPositions = useMemo<Map<string, THREE.Vector3>>(() => {
    const map = new Map<string, THREE.Vector3>()
    folderNodes.forEach((f, i) => {
      map.set(f.id, orbitPosition(i, folderNodes.length, 2.6, 0, 0.22))
    })
    return map
  }, [folderNodes])

  // Map folder name → color
  const folderColorMap = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>()
    folderNodes.forEach((f, i) => {
      map.set(f.id, FOLDER_COLORS[i % FOLDER_COLORS.length])
    })
    return map
  }, [folderNodes])

  // Group files by their top-level folder id
  const filesByFolder = useMemo<Map<string, VaultNode[]>>(() => {
    const map = new Map<string, VaultNode[]>()
    folderNodes.forEach((f) => map.set(f.id, []))

    fileNodes.forEach((file) => {
      // Match file to folder by name
      const parent = folderNodes.find((f) => f.name === file.folder)
      if (parent) {
        map.get(parent.id)?.push(file)
      }
    })
    return map
  }, [folderNodes, fileNodes])

  return (
    <>
      <color attach="background" args={[PALETTE.bg]} />
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 0, 0]} color={PALETTE.cyan} intensity={1.2} distance={8} />
      <pointLight position={[4, 2, -3]} color={PALETTE.blue} intensity={0.6} distance={12} />

      <StarField />
      <CameraDrift />
      <NexusOrb />

      {/* Folder nodes */}
      {folderNodes.map((folder) => {
        const pos   = folderPositions.get(folder.id)
        const color = folderColorMap.get(folder.id) ?? PALETTE.cyanDim
        if (!pos) return null
        return (
          <FolderNode
            key={folder.id}
            node={folder}
            position={pos}
            color={color}
            isHovered={hoveredId === folder.id}
            onHover={onHover}
            onClick={onClick}
          />
        )
      })}

      {/* File nodes */}
      <FileNodes
        folderPositions={folderPositions}
        filesByFolder={filesByFolder}
        hoveredId={hoveredId}
        onHover={onHover}
        onClick={onClick}
        folderColorMap={folderColorMap}
      />

      {/* Connection lines */}
      <AnimatedConnections
        folderPositions={folderPositions}
        filesByFolder={filesByFolder}
        hoveredId={hoveredId}
        folderColorMap={folderColorMap}
      />

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.12}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
        <ChromaticAberration
          offset={new THREE.Vector2(0.0008, 0.0008)}
          blendFunction={BlendFunction.NORMAL}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.7} />
      </EffectComposer>
    </>
  )
}

// ── Loading overlay ───────────────────────────────────────────────────────────

function LoadingOverlay() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '.' : d + '.')), 480)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: PALETTE.bg,
      zIndex: 20,
    }}>
      <span style={{
        color: PALETTE.cyan,
        fontFamily: 'monospace',
        fontSize: 13,
        letterSpacing: '0.18em',
        textShadow: `0 0 12px ${PALETTE.cyan}`,
      }}>
        NEXUS INITIALIZING{dots}
      </span>
    </div>
  )
}

// ── HUD chrome overlay ─────────────────────────────────────────────────────────

interface HudOverlayProps {
  nodeCount: number
  folderCount: number
  hoveredNode: VaultNode | null
}

function HudOverlay({ nodeCount, folderCount, hoveredNode }: HudOverlayProps) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      {/* Top-left corner bracket */}
      <svg style={{ position: 'absolute', top: 12, left: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M0 20 L0 0 L20 0" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>
      {/* Top-right corner bracket */}
      <svg style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M40 20 L40 0 L20 0" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>
      {/* Bottom-left corner bracket */}
      <svg style={{ position: 'absolute', bottom: 12, left: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M0 20 L0 40 L20 40" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>
      {/* Bottom-right corner bracket */}
      <svg style={{ position: 'absolute', bottom: 12, right: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M40 20 L40 40 L20 40" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>

      {/* Top header */}
      <div style={{
        position: 'absolute',
        top: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}>
        <span style={{
          color: PALETTE.cyan,
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: '0.3em',
          textShadow: `0 0 10px ${PALETTE.cyan}`,
          fontWeight: 700,
        }}>
          NEXUS VAULT
        </span>
        <span style={{
          color: PALETTE.cyanDim,
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: '0.2em',
        }}>
          KNOWLEDGE GRAPH
        </span>
      </div>

      {/* Bottom stats */}
      <div style={{
        position: 'absolute',
        bottom: 22,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 24,
      }}>
        {[
          { label: 'NODES', value: nodeCount },
          { label: 'CLUSTERS', value: folderCount },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{
              color: PALETTE.cyan,
              fontFamily: 'monospace',
              fontSize: 16,
              fontWeight: 700,
              textShadow: `0 0 10px ${PALETTE.cyan}`,
              lineHeight: 1,
            }}>
              {value}
            </div>
            <div style={{
              color: PALETTE.cyanDim,
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: '0.2em',
              marginTop: 2,
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Hover info — bottom left */}
      {hoveredNode && (
        <div style={{
          position: 'absolute',
          bottom: 22,
          left: 22,
          background: 'rgba(5,10,20,0.85)',
          border: `1px solid ${PALETTE.cyan}`,
          borderRadius: 4,
          padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            color: PALETTE.cyan,
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            fontWeight: 700,
            textShadow: `0 0 8px ${PALETTE.cyan}`,
          }}>
            {hoveredNode.name.toUpperCase()}
          </div>
          {hoveredNode.path && (
            <div style={{
              color: PALETTE.cyanDim,
              fontFamily: 'monospace',
              fontSize: 9,
              marginTop: 2,
              opacity: 0.8,
            }}>
              {hoveredNode.path}
            </div>
          )}
          <div style={{
            color: PALETTE.blue,
            fontFamily: 'monospace',
            fontSize: 9,
            marginTop: 4,
            letterSpacing: '0.1em',
          }}>
            {hoveredNode.type.toUpperCase()} — CLICK TO OPEN
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function VaultOrbGraph() {
  const [graph,       setGraph]       = useState<VaultGraph | null>(null)
  const [hoveredNode, setHoveredNode] = useState<VaultNode | null>(null)

  useEffect(() => {
    void fetch('/api/vault-graph')
      .then((r) => r.json() as Promise<VaultGraph>)
      .then(setGraph)
      .catch(() => {
        // If fetch fails, set empty graph — scene still renders
        setGraph({ nodes: [], links: [] })
      })
  }, [])

  const handleHover = useCallback((node: VaultNode | null) => {
    setHoveredNode(node)
  }, [])

  const handleClick = useCallback((node: VaultNode) => {
    if (node.type === 'root') return
    const enc = encodeURIComponent(node.path.replace(/\//g, '/'))
    window.open(`obsidian://open?vault=ObsidianVault&file=${enc}`)
  }, [])

  const hoveredId    = hoveredNode?.id ?? null
  const folderCount  = graph?.nodes.filter((n) => n.type === 'folder').length ?? 0
  const fileCount    = graph?.nodes.filter((n) => n.type === 'file').length ?? 0
  const nodeCount    = folderCount + fileCount

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: PALETTE.bg,
      overflow: 'hidden',
    }}>
      {!graph && <LoadingOverlay />}

      {graph && (
        <>
          <Canvas
            camera={{ position: [0, 1.2, 6.5], fov: 42 }}
            gl={{ antialias: true, alpha: false }}
            dpr={[1, 1.5]}
            style={{ width: '100%', height: '100%' }}
          >
            <NexusScene
              graph={graph}
              hoveredId={hoveredId}
              onHover={handleHover}
              onClick={handleClick}
            />
          </Canvas>

          <HudOverlay
            nodeCount={nodeCount}
            folderCount={folderCount}
            hoveredNode={hoveredNode}
          />
        </>
      )}
    </div>
  )
}
