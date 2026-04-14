import { NextResponse } from 'next/server'
import { getAgent } from '@/lib/agents'
import type { GraphData, GraphEdge, GraphNode, NodeKind } from '@/types/agent-graph'

// ── Colour palette keyed by node kind ─────────────────────────────────────
const KIND_COLOR: Record<NodeKind, string> = {
  identity: '#ff6fe0',
  memory:   '#00d4ff',
  idea:     '#efb356',
  task:     '#22c55e',
  chat:     '#b388ff',
  document: '#edf3ff',
}

function makeNode(
  id:       string,
  kind:     NodeKind,
  title:    string,
  body:     string,
  size:     number,
  status?:  GraphNode['status'],
): GraphNode {
  return {
    id,
    kind,
    title,
    body,
    color: KIND_COLOR[kind],
    size,
    sourceRef: { kind, refId: id },
    status:    status ?? null,
    createdAt: Date.now(),
  }
}

function makeEdge(
  source: string,
  target: string,
  kind:   GraphEdge['kind'] = 'references',
  weight = 0.7,
): GraphEdge {
  return { id: `${source}>>${target}`, source, target, kind, weight }
}

// ── Synthetic graph builder ────────────────────────────────────────────────

function buildGraph(agentId: string, agentLabel: string, agentDescription: string, agentRole: string): GraphData {
  const identityId = `identity:${agentId}`

  const nodes: GraphNode[] = [
    // Centre — identity
    makeNode(identityId, 'identity', agentLabel, agentDescription, 2.0, 'active'),

    // Memory nodes
    makeNode(
      `memory:${agentId}:role`,
      'memory',
      'ROLE & SPECIALTY',
      `Primary role: ${agentRole}. This memory anchors the agent's self-model and informs how it prioritises incoming work.`,
      1.2,
      'active',
    ),
    makeNode(
      `memory:${agentId}:protocols`,
      'memory',
      'OPERATING PROTOCOLS',
      'Core operating rules: lead with result, report DONE/BLOCKED, never fabricate, never narrate — act and report.',
      1.0,
      'active',
    ),

    // Task nodes (placeholder)
    makeNode(
      `task:${agentId}:monitor`,
      'task',
      'FLEET MONITORING',
      'Continuous watchdog pass — verify all gateways are responding, log latency, flag anomalies to Bo.',
      1.1,
      'active',
    ),
    makeNode(
      `task:${agentId}:briefs`,
      'task',
      'DAILY BRIEF GENERATION',
      'Compile a daily summary of activity, open tasks, blockers, and revenue events. Delivered to Bo by 08:00 CT.',
      1.0,
      'active',
    ),
    makeNode(
      `task:${agentId}:queue-triage`,
      'task',
      'QUEUE TRIAGE',
      'Scan QUEUE.md, pick up unowned tasks that match lane, update owner field, and set status to in_progress.',
      0.9,
      'fresh',
    ),

    // Document nodes
    makeNode(
      `document:${agentId}:soul`,
      'document',
      'SOUL.md',
      'Agent persona specification file. Defines identity, voice, hard rules, tool access, and operating boundaries.',
      1.3,
      'active',
    ),
    makeNode(
      `document:${agentId}:workspace`,
      'document',
      'WORKSPACE CONFIG',
      'OpenClaw gateway configuration. Model routing, context window settings, streaming mode, and bridge auth.',
      0.8,
      'active',
    ),
  ]

  const edges: GraphEdge[] = [
    // Identity is the hub — everything connects back to it
    makeEdge(identityId, `memory:${agentId}:role`,       'references', 0.9),
    makeEdge(identityId, `memory:${agentId}:protocols`,  'references', 0.85),
    makeEdge(identityId, `task:${agentId}:monitor`,      'spawned-from', 0.8),
    makeEdge(identityId, `task:${agentId}:briefs`,       'spawned-from', 0.75),
    makeEdge(identityId, `task:${agentId}:queue-triage`, 'spawned-from', 0.7),
    makeEdge(identityId, `document:${agentId}:soul`,     'references', 0.95),
    makeEdge(identityId, `document:${agentId}:workspace`,'references', 0.6),

    // Cross-links between peers
    makeEdge(`memory:${agentId}:role`,      `task:${agentId}:monitor`,      'mentions', 0.5),
    makeEdge(`document:${agentId}:soul`,    `memory:${agentId}:protocols`,  'references', 0.6),
    makeEdge(`task:${agentId}:queue-triage`,`task:${agentId}:monitor`,      'grouped-with', 0.4),
  ]

  return { agentId, nodes, edges }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const agent = getAgent(params.id)

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, { status: 404 })
  }

  const graph = buildGraph(agent.id, agent.label, agent.description, agent.role)
  return NextResponse.json(graph)
}
