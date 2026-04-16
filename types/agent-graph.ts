export type NodeKind =
  | 'identity'   // SOUL/IDENTITY/core persona — magenta (#ff6fe0), central
  | 'memory'     // parsed MEMORY.md section — cyan (#00d4ff)
  | 'idea'       // MissionIdea — gold (#efb356)
  | 'task'       // MissionTask — emerald if active, dim if done, red if blocked
  | 'chat'       // recent chat thread aggregate — violet (#b388ff)
  | 'document'   // UploadRecord — white (#edf3ff)

export interface GraphNode {
  id:        string            // stable id, e.g. "task:abc-123" or "memory:doc:sec-2"
  kind:      NodeKind
  title:     string            // short label shown on hover
  body?:     string            // longer description shown in the detail card
  color:     string            // primary orb color (derived from kind + status)
  size:      number            // 0.5 .. 2.0 — bigger = more important
  sourceRef: {                 // points back to the original data so the detail card can act on it
    kind:  NodeKind
    refId: string              // e.g. the MissionTask.id or MissionIdea.id or "soul" / "identity"
  }
  status?:   'active' | 'blocked' | 'done' | 'fresh' | 'claimed' | 'dismissed' | null
  createdAt?: number
}

export interface GraphEdge {
  id:     string       // stable id, e.g. "task:abc-123>>idea:xyz-456"
  source: string       // GraphNode.id
  target: string       // GraphNode.id
  kind:   'spawned-from' | 'references' | 'mentions' | 'grouped-with'
  weight: number       // 0..1, drives line opacity + thickness
}

export interface GraphData {
  agentId: string
  nodes:   GraphNode[]
  edges:   GraphEdge[]
}

export interface NodePosition {
  id: string
  x:  number
  y:  number
  z:  number
}
