import { useMemo } from 'react'
import type { GraphData, NodeKind } from '@/types/agent-graph'

const MAX_NODES = 120

// Shell radii per kind group
const SHELL_RADIUS: Record<NodeKind, number> = {
  identity: 0,    // center cluster — handled separately
  task:     3,
  memory:   5,
  idea:     5,
  chat:     7,
  document: 7,
}

// A simple deterministic "random" number generator seeded by a string.
// lcg: cheap, predictable, no deps.
function seededRng(seed: string): () => number {
  let state = 0
  for (let i = 0; i < seed.length; i++) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Distribute n points on a sphere surface using the golden-angle spiral.
// Returns array of [x, y, z] unit-sphere positions, deterministic per offset.
function goldenSphere(n: number, radius: number, offset: number): [number, number, number][] {
  const positions: [number, number, number][] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const idx   = i + offset
    const theta = goldenAngle * idx
    // y spread from +1 to -1 over the sphere
    const y     = 1 - (idx / Math.max(n + offset - 1, 1)) * 2
    const r     = Math.sqrt(Math.max(0, 1 - y * y))
    positions.push([
      Math.cos(theta) * r * radius,
      y * radius,
      Math.sin(theta) * r * radius,
    ])
  }
  return positions
}

export function useConstellationLayout(
  graph: GraphData
): Map<string, [number, number, number]> {
  const cacheKey = useMemo(() => {
    const nodeHash = graph.nodes.map(n => n.id).sort().join('|')
    const edgeHash = graph.edges.map(e => e.id).sort().join('|')
    return `${graph.agentId}:${nodeHash}:${edgeHash}`
  }, [graph])

  return useMemo(() => {
    const nodeCount = graph.nodes.length
    if (nodeCount > MAX_NODES) {
      // eslint-disable-next-line no-console
      console.warn(
        `[useConstellationLayout] Node count ${nodeCount} exceeds MAX_NODES (${MAX_NODES}). ` +
        'Extra nodes will not be positioned correctly. Consider paginating or filtering nodes.'
      )
    }

    const rng = seededRng(graph.agentId)
    const positions = new Map<string, [number, number, number]>()

    // Separate nodes by kind
    const byKind: Partial<Record<NodeKind, string[]>> = {}
    for (const node of graph.nodes) {
      if (!byKind[node.kind]) byKind[node.kind] = []
      byKind[node.kind]!.push(node.id)
    }

    // — Identity: center cluster stacked vertically on z, small radius
    const identityIds = byKind['identity'] ?? []
    for (let i = 0; i < identityIds.length; i++) {
      const spread = identityIds.length > 1 ? (i / (identityIds.length - 1) - 0.5) * 1.2 : 0
      // Add a tiny seeded jitter so multi-identity agents don't perfectly stack
      const jx = (rng() - 0.5) * 0.3
      const jz = (rng() - 0.5) * 0.3
      positions.set(identityIds[i], [jx, spread, jz])
    }

    // — All other kinds on shells using golden spiral
    // Compute a per-agent deterministic integer offset so Doc's constellation
    // always looks different from Linda's even with the same node count.
    let agentOffset = 0
    for (let i = 0; i < graph.agentId.length; i++) {
      agentOffset = (agentOffset * 31 + graph.agentId.charCodeAt(i)) & 0xffff
    }

    const kindOrder: NodeKind[] = ['task', 'memory', 'idea', 'chat', 'document']
    // Track spiral offset per shell radius so nodes on the same shell don't
    // pile up in the same spots when multiple kinds share a radius.
    const shellCursors: Record<number, number> = {}

    for (const kind of kindOrder) {
      const ids = byKind[kind] ?? []
      if (ids.length === 0) continue

      const radius = SHELL_RADIUS[kind]
      const shellStart = shellCursors[radius] ?? agentOffset
      const spherePositions = goldenSphere(ids.length, radius, shellStart)
      shellCursors[radius] = shellStart + ids.length

      for (let i = 0; i < ids.length; i++) {
        positions.set(ids[i], spherePositions[i])
      }
    }

    return positions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])
}
