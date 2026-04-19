'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sparkles, MeshDistortMaterial, Html } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VaultNode {
  id: string
  name: string
  type: 'root' | 'folder' | 'file'
  path: string
  folder: string
}

interface VaultGraph {
  nodes: VaultNode[]
  links: { source: string; target: string }[]
}

// ── Color palette ─────────────────────────────────────────────────────────────

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

const FOLDER_COLORS: string[] = [
  PALETTE.cyan,
  PALETTE.blue,
  PALETTE.green,
  PALETTE.amber,
  PALETTE.teal,
  PALETTE.magenta,
  PALETTE.gold,
  PALETTE.red,
]

// ── Geometry helpers ──────────────────────────────────────────────────────────

function orbitPosition(index: number, total: number, radius: number): THREE.Vector3 {
  const angle = (index / total) * Math.PI * 2
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle * 0.4) * 0.6,
    Math.sin(angle) * radius * Math.cos(0.22)
  )
}

function fileOrbitPos(
  fileIndex: number,
  totalFiles: number,
  parentPos: THREE.Vector3,
  t: number
): [number, number, number] {
  const angle = (fileIndex / Math.max(totalFiles, 1)) * Math.PI * 2 + t * 0.18 + fileIndex * 0.7
  return [
    parentPos.x + Math.cos(angle) * 0.52,
    parentPos.y + Math.sin(angle * 0.5) * 0.3,
    parentPos.z + Math.sin(angle) * 0.52,
  ]
}

// ── Central Nexus Orb ─────────────────────────────────────────────────────────

function NexusOrb() {
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const shellRef = useRef<THREE.Mesh>(null)
  const ringRef  = useRef<THREE.Mesh>(null)
  const t        = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    const s = t.current
    if (outerRef.current) { outerRef.current.rotation.y = s * 0.15; outerRef.current.rotation.x = s * 0.07 }
    if (innerRef.current) { innerRef.current.rotation.y = -s * 0.22; innerRef.current.rotation.z = s * 0.09 }
    if (shellRef.current) { shellRef.current.rotation.y = s * 0.08; shellRef.current.rotation.x = s * 0.05 }
    if (ringRef.current)  { ringRef.current.rotation.z = s * 0.12; ringRef.current.rotation.x = Math.sin(s * 0.3) * 0.15 }
  })

  return (
    <group>
      <mesh ref={shellRef}>
        <sphereGeometry args={[1.55, 32, 32]} />
        <meshStandardMaterial color={PALETTE.blue} emissive={PALETTE.blue} emissiveIntensity={0.6} transparent opacity={0.04} side={THREE.BackSide} toneMapped={false} />
      </mesh>
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[1.3, 3]} />
        <MeshDistortMaterial color="#030c1a" emissive={PALETTE.cyan} emissiveIntensity={1.4} distort={0.25} speed={1.8} wireframe transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.72, 32, 32]} />
        <meshStandardMaterial color="#020a18" emissive={PALETTE.blue} emissiveIntensity={2.2} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2.5, 0, 0]}>
        <torusGeometry args={[1.35, 0.012, 6, 96]} />
        <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, Math.PI / 3]}>
        <torusGeometry args={[1.42, 0.007, 6, 96]} />
        <meshBasicMaterial color={PALETTE.blue} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Sparkles count={180} scale={3.4} size={0.6} speed={0.35} color={PALETTE.cyan} opacity={0.9} />
      <Sparkles count={80} scale={1.8} size={0.4} speed={0.6} color={PALETTE.blue} opacity={0.7} />
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
  const meshRef = useRef<THREE.Mesh>(null)
  const wireRef = useRef<THREE.Mesh>(null)
  const t       = useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    t.current += delta
    if (!meshRef.current || !wireRef.current) return
    const pulse = 1 + Math.sin(t.current * 1.8) * 0.04
    const target = isHovered ? 1.5 * pulse : pulse
    meshRef.current.scale.setScalar(THREE.MathUtils.lerp(meshRef.current.scale.x, target, 0.08))
    wireRef.current.scale.setScalar(meshRef.current.scale.x * 1.3)
    wireRef.current.rotation.y = t.current * 0.4
    wireRef.current.rotation.x = t.current * 0.25
  })

  const threeColor = useMemo(() => new THREE.Color(color), [color])

  return (
    <group position={position}>
      <mesh ref={wireRef}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshBasicMaterial color={threeColor} wireframe transparent opacity={isHovered ? 0.9 : 0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={meshRef} onPointerEnter={() => onHover(node)} onPointerLeave={() => onHover(null)} onClick={() => onClick(node)}>
        <octahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial color="#030c1a" emissive={threeColor} emissiveIntensity={isHovered ? 3.0 : 1.8} toneMapped={false} />
      </mesh>
      {isHovered && (
        <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(5,10,20,0.88)', border: `1px solid ${color}`, borderRadius: 3, padding: '3px 8px', color, fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)', textShadow: `0 0 8px ${color}` }}>
            {node.name.toUpperCase()}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Animated File Node — positions itself each frame via ref ──────────────────

interface AnimatedFileNodeProps {
  node: VaultNode
  fileIndex: number
  totalFiles: number
  parentPos: THREE.Vector3
  color: string
  isHovered: boolean
  onHover: (node: VaultNode | null) => void
  onClick: (node: VaultNode) => void
}

function AnimatedFileNode({ node, fileIndex, totalFiles, parentPos, color, isHovered, onHover, onClick }: AnimatedFileNodeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef  = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!groupRef.current) return
    const [x, y, z] = fileOrbitPos(fileIndex, totalFiles, parentPos, state.clock.elapsedTime)
    groupRef.current.position.set(x, y, z)
    if (meshRef.current) {
      const target = isHovered ? 1.8 : 1.0
      meshRef.current.scale.setScalar(THREE.MathUtils.lerp(meshRef.current.scale.x, target, 0.1))
    }
  })

  const threeColor = useMemo(() => new THREE.Color(color), [color])

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} onPointerEnter={() => onHover(node)} onPointerLeave={() => onHover(null)} onClick={() => onClick(node)}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color="#020810" emissive={threeColor} emissiveIntensity={isHovered ? 4.0 : 2.2} toneMapped={false} />
      </mesh>
      {isHovered && (
        <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(5,10,20,0.88)', border: `1px solid ${color}`, borderRadius: 3, padding: '2px 7px', color, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)', textShadow: `0 0 6px ${color}` }}>
            {node.name}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Animated connection line — updates geometry each frame via ref ─────────────

interface AnimatedFileLineProps {
  fileIndex: number
  totalFiles: number
  parentPos: THREE.Vector3
  color: string
  isHovered: boolean
}

function AnimatedFileLine({ fileIndex, totalFiles, parentPos, color, isHovered }: AnimatedFileLineProps) {
  const objRef = useRef<THREE.Line | null>(null)

  const { geo, line } = useMemo(() => {
    const arr = new Float32Array(6)
    arr[0] = parentPos.x; arr[1] = parentPos.y; arr[2] = parentPos.z
    arr[3] = parentPos.x; arr[4] = parentPos.y; arr[5] = parentPos.z
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: isHovered ? 0.6 : 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return { geo: g, line: new THREE.Line(g, mat) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPos, color])

  useEffect(() => {
    const mat = line.material as THREE.LineBasicMaterial
    mat.opacity = isHovered ? 0.6 : 0.12
    mat.needsUpdate = true
  }, [isHovered, line])

  useFrame((state) => {
    const [x, y, z] = fileOrbitPos(fileIndex, totalFiles, parentPos, state.clock.elapsedTime)
    const positions = geo.attributes.position as THREE.BufferAttribute
    positions.setXYZ(1, x, y, z)
    positions.needsUpdate = true
  })

  return <primitive ref={objRef} object={line} />
}

// ── Static root→folder connection lines ───────────────────────────────────────

interface RootLineProps {
  folderPos: THREE.Vector3
  color: string
  isHovered: boolean
}

function RootLine({ folderPos, color, isHovered }: RootLineProps) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), folderPos])
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: isHovered ? 0.45 : 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return new THREE.Line(geo, mat)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPos, color])

  useEffect(() => {
    const mat = line.material as THREE.LineBasicMaterial
    mat.opacity = isHovered ? 0.45 : 0.15
    mat.needsUpdate = true
  }, [isHovered, line])

  return <primitive object={line} />
}

// ── Ambient star field ────────────────────────────────────────────────────────

function StarField() {
  const pointsRef = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const count = 400
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 24
      pos[i * 3 + 1] = (Math.random() - 0.5) * 24
      pos[i * 3 + 2] = (Math.random() - 0.5) * 24
    }
    return pos
  }, [])

  useFrame((_, delta) => {
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.006
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={PALETTE.cyanDim} size={0.015} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  )
}

// ── Camera drift ──────────────────────────────────────────────────────────────

function CameraDrift() {
  const { camera } = useThree()
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta * 0.12
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, Math.sin(t.current) * 0.3, 0.02)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, Math.cos(t.current * 0.7) * 0.2, 0.02)
    camera.lookAt(0, 0, 0)
  })
  return null
}

// ── Scene ─────────────────────────────────────────────────────────────────────

interface SceneProps {
  graph: VaultGraph
  hoveredId: string | null
  onHover: (node: VaultNode | null) => void
  onClick: (node: VaultNode) => void
}

function NexusScene({ graph, hoveredId, onHover, onClick }: SceneProps) {
  const folderNodes = useMemo(() => graph.nodes.filter((n) => n.type === 'folder'), [graph])
  const fileNodes   = useMemo(() => graph.nodes.filter((n) => n.type === 'file'), [graph])

  const folderPositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    folderNodes.forEach((f, i) => map.set(f.id, orbitPosition(i, folderNodes.length, 2.6)))
    return map
  }, [folderNodes])

  const folderColorMap = useMemo(() => {
    const map = new Map<string, string>()
    folderNodes.forEach((f, i) => map.set(f.id, FOLDER_COLORS[i % FOLDER_COLORS.length]))
    return map
  }, [folderNodes])

  const filesByFolder = useMemo(() => {
    const map = new Map<string, VaultNode[]>()
    folderNodes.forEach((f) => map.set(f.id, []))
    fileNodes.forEach((file) => {
      const parent = folderNodes.find((f) => f.name === file.folder)
      if (parent) map.get(parent.id)?.push(file)
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

      {/* Root → folder lines */}
      {folderNodes.map((folder) => {
        const pos   = folderPositions.get(folder.id)
        const color = folderColorMap.get(folder.id) ?? PALETTE.cyanDim
        if (!pos) return null
        return <RootLine key={`rl-${folder.id}`} folderPos={pos} color={color} isHovered={hoveredId === folder.id} />
      })}

      {/* Folder → file animated lines */}
      {folderNodes.map((folder) => {
        const pos   = folderPositions.get(folder.id)
        const color = folderColorMap.get(folder.id) ?? PALETTE.cyanDim
        const files = filesByFolder.get(folder.id) ?? []
        if (!pos) return null
        return files.map((file, fi) => (
          <AnimatedFileLine
            key={`fl-${file.id}`}
            fileIndex={fi}
            totalFiles={files.length}
            parentPos={pos}
            color={color}
            isHovered={hoveredId === file.id}
          />
        ))
      })}

      {/* Folder nodes */}
      {folderNodes.map((folder) => {
        const pos   = folderPositions.get(folder.id)
        const color = folderColorMap.get(folder.id) ?? PALETTE.cyanDim
        if (!pos) return null
        return (
          <FolderNode key={folder.id} node={folder} position={pos} color={color} isHovered={hoveredId === folder.id} onHover={onHover} onClick={onClick} />
        )
      })}

      {/* File nodes — each animates its own position via useFrame */}
      {folderNodes.map((folder) => {
        const pos   = folderPositions.get(folder.id)
        const color = folderColorMap.get(folder.id) ?? PALETTE.cyanDim
        const files = filesByFolder.get(folder.id) ?? []
        if (!pos) return null
        return files.map((file, fi) => (
          <AnimatedFileNode
            key={file.id}
            node={file}
            fileIndex={fi}
            totalFiles={files.length}
            parentPos={pos}
            color={color}
            isHovered={hoveredId === file.id}
            onHover={onHover}
            onClick={onClick}
          />
        ))
      })}

      <EffectComposer>
        <Bloom intensity={1.4} luminanceThreshold={0.12} luminanceSmoothing={0.85} mipmapBlur />
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PALETTE.bg, zIndex: 20 }}>
      <span style={{ color: PALETTE.cyan, fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.18em', textShadow: `0 0 12px ${PALETTE.cyan}` }}>
        NEXUS INITIALIZING{dots}
      </span>
    </div>
  )
}

// ── HUD overlay ───────────────────────────────────────────────────────────────

interface HudOverlayProps {
  nodeCount: number
  folderCount: number
  hoveredNode: VaultNode | null
}

function HudOverlay({ nodeCount, folderCount, hoveredNode }: HudOverlayProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <svg style={{ position: 'absolute', top: 12, left: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M0 20 L0 0 L20 0" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>
      <svg style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M40 20 L40 0 L20 0" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>
      <svg style={{ position: 'absolute', bottom: 12, left: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M0 20 L0 40 L20 40" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>
      <svg style={{ position: 'absolute', bottom: 12, right: 12, width: 40, height: 40 }} viewBox="0 0 40 40">
        <path d="M40 20 L40 40 L20 40" fill="none" stroke={PALETTE.cyan} strokeWidth="1.5" opacity="0.7" />
      </svg>

      <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ color: PALETTE.cyan, fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.3em', textShadow: `0 0 10px ${PALETTE.cyan}`, fontWeight: 700 }}>NEXUS VAULT</span>
        <span style={{ color: PALETTE.cyanDim, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em' }}>KNOWLEDGE GRAPH</span>
      </div>

      <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 24 }}>
        {([['NODES', nodeCount], ['CLUSTERS', folderCount]] as const).map(([label, value]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ color: PALETTE.cyan, fontFamily: 'monospace', fontSize: 16, fontWeight: 700, textShadow: `0 0 10px ${PALETTE.cyan}`, lineHeight: 1 }}>{value}</div>
            <div style={{ color: PALETTE.cyanDim, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {hoveredNode && (
        <div style={{ position: 'absolute', bottom: 22, left: 22, background: 'rgba(5,10,20,0.85)', border: `1px solid ${PALETTE.cyan}`, borderRadius: 4, padding: '6px 12px', backdropFilter: 'blur(8px)' }}>
          <div style={{ color: PALETTE.cyan, fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em', fontWeight: 700, textShadow: `0 0 8px ${PALETTE.cyan}` }}>{hoveredNode.name.toUpperCase()}</div>
          {hoveredNode.path && <div style={{ color: PALETTE.cyanDim, fontFamily: 'monospace', fontSize: 9, marginTop: 2, opacity: 0.8 }}>{hoveredNode.path}</div>}
          <div style={{ color: PALETTE.blue, fontFamily: 'monospace', fontSize: 9, marginTop: 4, letterSpacing: '0.1em' }}>{hoveredNode.type.toUpperCase()} — CLICK TO OPEN</div>
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
      .catch(() => setGraph({ nodes: [], links: [] }))
  }, [])

  const handleHover  = useCallback((node: VaultNode | null) => setHoveredNode(node), [])
  const handleClick  = useCallback((node: VaultNode) => {
    if (node.type === 'root') return
    window.open(`obsidian://open?vault=ObsidianVault&file=${encodeURIComponent(node.path)}`)
  }, [])

  const hoveredId   = hoveredNode?.id ?? null
  const folderCount = graph?.nodes.filter((n) => n.type === 'folder').length ?? 0
  const fileCount   = graph?.nodes.filter((n) => n.type === 'file').length ?? 0

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: PALETTE.bg, overflow: 'hidden' }}>
      {!graph && <LoadingOverlay />}
      {graph && (
        <>
          <Canvas camera={{ position: [0, 1.2, 6.5], fov: 42 }} gl={{ antialias: true, alpha: false }} dpr={[1, 1.5]} style={{ width: '100%', height: '100%' }}>
            <NexusScene graph={graph} hoveredId={hoveredId} onHover={handleHover} onClick={handleClick} />
          </Canvas>
          <HudOverlay nodeCount={folderCount + fileCount} folderCount={folderCount} hoveredNode={hoveredNode} />
        </>
      )}
    </div>
  )
}
