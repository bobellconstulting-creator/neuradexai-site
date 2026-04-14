/**
 * AgentRoom barrel — public surface for the Agent Room feature.
 *
 * Note: AgentRoomScene is a default export from its own file (owned by the
 * hud-3d-specialist subagent). We re-export it as a named export here so
 * consumers can `import { AgentRoomScene } from '...'` uniformly.
 */

export { default as AgentRoomScene } from './AgentRoomScene'
export { AgentHero } from './AgentHero'
export { NodeDetailCard } from './NodeDetailCard'
export { ChatDock } from './ChatDock'
export { StackingBar } from './StackingBar'
export { useAgentGraph } from './hooks/useAgentGraph'
export { useConstellationLayout } from './hooks/useConstellationLayout'
export type { GraphData, GraphNode, GraphEdge, NodeKind } from '@/types/agent-graph'
