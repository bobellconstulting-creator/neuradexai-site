'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { GraphData, GraphNode } from '@/types/agent-graph'
import { useConstellationLayout } from './hooks/useConstellationLayout'
import ConstellationGraph from './ConstellationGraph'

interface AgentRoomSceneProps {
  graph:            GraphData
  focusedNodeId:    string | null
  onSelectNode:     (node: GraphNode | null) => void
  audioLevel?:      number
  agentAccentColor: string
  className?:       string
}

function SceneContent({
  graph,
  focusedNodeId,
  onSelectNode,
  audioLevel,
  agentAccentColor,
}: Omit<AgentRoomSceneProps, 'className'>) {
  const positions = useConstellationLayout(graph)

  return (
    <>
      <ambientLight intensity={0.05} />
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={25}
        dampingFactor={0.12}
        enableDamping={true}
        target={[0, 0, 0]}
        touches={{
          ONE: 2,   // THREE.TOUCH.ROTATE = 2
          TWO: 1,   // THREE.TOUCH.DOLLY_PAN = 1
        }}
      />
      <ConstellationGraph
        graph={graph}
        positions={positions}
        focusedNodeId={focusedNodeId}
        onSelectNode={onSelectNode}
        audioLevel={audioLevel}
        agentAccentColor={agentAccentColor}
      />
    </>
  )
}

export default function AgentRoomScene({
  graph,
  focusedNodeId,
  onSelectNode,
  audioLevel = 0,
  agentAccentColor,
  className,
}: AgentRoomSceneProps) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 15], fov: 55 }}
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%', touchAction: 'manipulation' }}
      className={className}
    >
      <SceneContent
        graph={graph}
        focusedNodeId={focusedNodeId}
        onSelectNode={onSelectNode}
        audioLevel={audioLevel}
        agentAccentColor={agentAccentColor}
      />
    </Canvas>
  )
}
