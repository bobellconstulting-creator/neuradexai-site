'use client'

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import ConstellationNode from './ConstellationNode'
import ConstellationEdge from './ConstellationEdge'
import type { GraphData, GraphNode } from '@/types/agent-graph'

interface ConstellationGraphProps {
  graph:            GraphData
  positions:        Map<string, [number, number, number]>
  focusedNodeId:    string | null
  onSelectNode:     (node: GraphNode | null) => void
  audioLevel?:      number
  agentAccentColor: string
}

// Invisible backdrop for "click empty space to deselect"
function BackdropDeselect({ onDeselect }: { onDeselect: () => void }) {
  const backdropGeo = useMemo(() => new THREE.SphereGeometry(40, 8, 8), [])
  const backdropMat = useMemo(() => new THREE.MeshBasicMaterial({
    side:        THREE.BackSide,
    transparent: true,
    opacity:     0,
    depthWrite:  false,
  }), [])

  return (
    <mesh
      geometry={backdropGeo}
      material={backdropMat}
      onClick={(e) => { e.stopPropagation(); onDeselect() }}
    />
  )
}

// Camera ease toward focused node
function CameraController({
  focusedNodeId,
  positions,
}: {
  focusedNodeId: string | null
  positions:     Map<string, [number, number, number]>
}) {
  const { camera } = useThree()
  const targetLook = useRef(new THREE.Vector3(0, 0, 0))
  const currentLook = useRef(new THREE.Vector3(0, 0, 0))

  useFrame(() => {
    if (focusedNodeId) {
      const pos = positions.get(focusedNodeId)
      if (pos) {
        targetLook.current.set(pos[0], pos[1], pos[2])
      }
    } else {
      targetLook.current.set(0, 0, 0)
    }

    currentLook.current.lerp(targetLook.current, 0.08)

    // Nudge camera to look toward the focused node without breaking OrbitControls
    // (OrbitControls owns camera.rotation; we only shift the lookat target softly
    // by moving the camera position slightly toward the node)
    if (focusedNodeId) {
      const pos = positions.get(focusedNodeId)
      if (pos) {
        const nodePos = new THREE.Vector3(...pos)
        const camPos  = camera.position.clone()
        const dir     = nodePos.clone().sub(camPos).normalize()
        const ideal   = nodePos.clone().sub(dir.multiplyScalar(8))
        camera.position.lerp(ideal, 0.04)
      }
    }
  })

  return null
}

export default function ConstellationGraph({
  graph,
  positions,
  focusedNodeId,
  onSelectNode,
  audioLevel = 0,
  agentAccentColor,
}: ConstellationGraphProps) {
  // Parse accent color once for lighting
  const accentHex = useMemo(() => {
    try {
      return new THREE.Color(agentAccentColor)
    } catch {
      return new THREE.Color('#00d4ff')
    }
  }, [agentAccentColor])

  return (
    <>
      {/* Lighting tinted toward agent accent */}
      <ambientLight intensity={0.08} color={accentHex} />
      <pointLight
        position={[0, 0, 0]}
        intensity={1.2}
        distance={30}
        color={accentHex}
      />
      <pointLight
        position={[0, 8, -5]}
        intensity={0.4}
        distance={20}
        color="#ffffff"
      />

      {/* Starfield depth reference */}
      <Stars
        radius={80}
        depth={40}
        count={800}
        factor={3}
        saturation={0}
        fade
        speed={0.4}
      />

      {/* Invisible deselect backdrop */}
      <BackdropDeselect onDeselect={() => onSelectNode(null)} />

      {/* Camera controller */}
      <CameraController focusedNodeId={focusedNodeId} positions={positions} />

      {/* Edges */}
      {graph.edges.map((edge) => {
        const fromPos = positions.get(edge.source) ?? [0, 0, 0] as [number, number, number]
        const toPos   = positions.get(edge.target) ?? [0, 0, 0] as [number, number, number]
        return (
          <ConstellationEdge
            key={edge.id}
            from={fromPos}
            to={toPos}
            weight={edge.weight}
          />
        )
      })}

      {/* Nodes */}
      {graph.nodes.map((node) => {
        const pos = positions.get(node.id) ?? [0, 0, 0] as [number, number, number]
        return (
          <ConstellationNode
            key={node.id}
            node={node}
            position={pos}
            focused={node.id === focusedNodeId}
            onClick={onSelectNode}
            audioLevel={audioLevel}
          />
        )
      })}

      {/* Bloom — matches AgentOrbScene knobs */}
      <EffectComposer>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.12}
          luminanceSmoothing={0.85}
          height={300}
        />
      </EffectComposer>
    </>
  )
}
