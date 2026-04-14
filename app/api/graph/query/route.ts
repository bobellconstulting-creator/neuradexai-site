import { NextRequest, NextResponse } from 'next/server'
import { getGraph } from '@/lib/graphBuilder'
import type { GraphLink, GraphNode } from '@/lib/graphBuilder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueryRequest {
  query: string
  focus?: string
  depth?: number
}

interface QueryResponse {
  nodes: GraphNode[]
  links: GraphLink[]
  summary: string
}

// ---------------------------------------------------------------------------
// BFS subgraph extractor
// ---------------------------------------------------------------------------

function extractSubgraph(
  allNodes: GraphNode[],
  allLinks: GraphLink[],
  seedIds: Set<string>,
  depth: number,
): { nodes: GraphNode[]; links: GraphLink[] } {
  // Build adjacency: both directions so BFS traverses imports in/out
  const adj = new Map<string, Set<string>>()
  for (const link of allLinks) {
    if (!adj.has(link.source)) adj.set(link.source, new Set())
    if (!adj.has(link.target)) adj.set(link.target, new Set())
    adj.get(link.source)!.add(link.target)
    adj.get(link.target)!.add(link.source)
  }

  const visited = new Set<string>(seedIds)
  let frontier = [...seedIds]

  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId)
      if (!neighbors) continue
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }

  const nodes = allNodes.filter((n) => visited.has(n.id))
  const links = allLinks.filter(
    (l) => visited.has(l.source) && visited.has(l.target),
  )
  return { nodes, links }
}

// ---------------------------------------------------------------------------
// Seed finder
// ---------------------------------------------------------------------------

function findSeeds(nodes: GraphNode[], term: string): Set<string> {
  const lower = term.toLowerCase()
  const seeds = new Set<string>()
  for (const node of nodes) {
    if (
      node.name.toLowerCase().includes(lower) ||
      node.path.toLowerCase().includes(lower) ||
      node.id.toLowerCase().includes(lower)
    ) {
      seeds.add(node.id)
    }
  }
  return seeds
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function parseBody(raw: unknown): QueryRequest | { error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'Request body must be a JSON object' }
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.query !== 'string' || obj.query.trim() === '') {
    return { error: '"query" is required and must be a non-empty string' }
  }

  const depth =
    obj.depth === undefined
      ? 2
      : typeof obj.depth === 'number'
        ? Math.min(Math.max(1, Math.floor(obj.depth)), 4)
        : null

  if (depth === null) {
    return { error: '"depth" must be a number between 1 and 4' }
  }

  const focus =
    obj.focus === undefined
      ? undefined
      : typeof obj.focus === 'string'
        ? obj.focus
        : null

  if (focus === null) {
    return { error: '"focus" must be a string if provided' }
  }

  return { query: obj.query.trim(), focus, depth }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
      { status: 400 },
    )
  }

  const parsed = parseBody(rawBody)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { query, focus, depth } = parsed

  let graph
  try {
    graph = getGraph()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Graph build failed'
    return NextResponse.json({ error: message, code: 'GRAPH_BUILD_ERROR' }, { status: 500 })
  }

  // Determine seed nodes — prefer focus, fall back to query terms
  const searchTerm = focus ?? query
  const seeds = findSeeds(graph.nodes, searchTerm)

  if (seeds.size === 0) {
    const response: QueryResponse = {
      nodes: [],
      links: [],
      summary: `No nodes found matching "${searchTerm}"`,
    }
    return NextResponse.json(response)
  }

  const resolvedDepth = depth ?? 2
  const { nodes, links } = extractSubgraph(graph.nodes, graph.links, seeds, resolvedDepth)

  const focusLabel = focus ?? `"${query}"`
  const summary = `Found ${nodes.length} node${nodes.length === 1 ? '' : 's'} and ${links.length} link${links.length === 1 ? '' : 's'} within ${resolvedDepth} hop${resolvedDepth === 1 ? '' : 's'} of ${focusLabel}`

  const response: QueryResponse = { nodes, links, summary }
  return NextResponse.json(response)
}
