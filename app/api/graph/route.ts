import { NextResponse } from 'next/server'
import { getGraph } from '@/lib/graphBuilder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type { NodeType, GraphNode, GraphLink, GraphData } from '@/lib/graphBuilder'

export async function GET(): Promise<NextResponse> {
  try {
    const data = getGraph()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error building graph'
    return NextResponse.json({ error: message, code: 'GRAPH_BUILD_ERROR' }, { status: 500 })
  }
}
