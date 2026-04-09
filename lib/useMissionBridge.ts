'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'online' | 'busy' | 'idle' | 'offline'

export interface MissionAgent {
  id:        string
  label:     string
  role:      string
  model:     string
  status:    AgentStatus
  latencyMs: number
  lastAction:string
  color:     string
  /** angle around the radar core in degrees */
  angle:     number
  /** orbit radius factor (0..1 of usable radar radius) */
  orbit:     number
}

export interface MissionEvent {
  id:        string
  timestamp: number
  agentId:   string
  agentLabel:string
  kind:      'message' | 'task' | 'alert' | 'system'
  text:      string
}

export interface MissionTelemetry {
  cpu:       number   // 0..100
  memory:    number   // 0..100
  wsLatency: number   // ms
  uptimeSec: number
  bridgeUp:  boolean
}

export interface MissionState {
  agents:    MissionAgent[]
  events:    MissionEvent[]
  telemetry: MissionTelemetry
  connected: boolean
}

// ── Static agent roster (Bo's fleet) ─────────────────────────────────────────

export const FLEET: MissionAgent[] = [
  { id:'jarvis',  label:'JARVIS',  role:'Chief of Staff',     model:'kimi-k2.5',         status:'online', latencyMs:142, lastAction:'monitoring telegram',  color:'#00F2FF', angle:0,   orbit:0.78 },
  { id:'linda',   label:'LINDA',   role:'Research Analyst',   model:'kimi-k2 (groq)',    status:'online', latencyMs:188, lastAction:'weekly brief draft',    color:'#A78BFA', angle:51,  orbit:0.82 },
  { id:'marcus',  label:'MARCUS',  role:'Code Architect',     model:'deepseek-v3.2+acp', status:'busy',   latencyMs:312, lastAction:'spawning ACP session',  color:'#22C55E', angle:103, orbit:0.75 },
  { id:'atlas',   label:'ATLAS',   role:'Cron / Director',    model:'llama-3.3-70b',     status:'online', latencyMs:204, lastAction:'next run T-12m',        color:'#F59E0B', angle:154, orbit:0.84 },
  { id:'claude',  label:'CLAUDE',  role:'Strategic Reasoning',model:'sonnet-4.6',        status:'online', latencyMs:280, lastAction:'architecture review',   color:'#FB923C', angle:206, orbit:0.82 },
  { id:'bob',     label:'BOB',     role:'Execution Engine',   model:'deepseek-v3.2',     status:'online', latencyMs:220, lastAction:'parallel task queue',   color:'#06B6D4', angle:257, orbit:0.80 },
  { id:'aria',    label:'ARIA',    role:'Deployment Machine', model:'deepseek-v3.2',     status:'online', latencyMs:180, lastAction:'vercel deploy verified',color:'#EC4899', angle:309, orbit:0.78 },
]

// ── Simulated event templates ────────────────────────────────────────────────

const FEED_ACTIONS: Array<Omit<MissionEvent, 'id' | 'timestamp'>> = [
  { agentId:'jarvis',  agentLabel:'JARVIS',  kind:'message', text:'Telegram inbound — Bo, status check on BuckGrid.' },
  { agentId:'marcus',  agentLabel:'MARCUS',  kind:'task',    text:'Spawning ACP session for tony-prompt refactor.' },
  { agentId:'linda',   agentLabel:'LINDA',   kind:'message', text:'Filed competitive brief: HuntStand vs BuckGrid (12pp).' },
  { agentId:'axon',    agentLabel:'AXON',    kind:'system',  text:'Gateway heartbeat OK — 18789 latency 38ms.' },
  { agentId:'atlas',   agentLabel:'ATLAS',   kind:'task',    text:'Cron triggered: site-monitor.weekly.' },
  { agentId:'aria',    agentLabel:'ARIA',    kind:'message', text:'Voice synth standby — onyx warm.' },
  { agentId:'jarvis',  agentLabel:'JARVIS',  kind:'alert',   text:'OpenAI 429 detected — falling back to Fireworks.' },
  { agentId:'marcus',  agentLabel:'MARCUS',  kind:'message', text:'Build green: tsc --noEmit clean.' },
  { agentId:'linda',   agentLabel:'LINDA',   kind:'system',  text:'Heartbeat: 4h cycle complete.' },
  { agentId:'axon',    agentLabel:'AXON',    kind:'system',  text:'WS frame: agent.update id=marcus.' },
]

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// ── The hook ─────────────────────────────────────────────────────────────────

export function useMissionBridge(): MissionState {
  const [agents, setAgents] = useState<MissionAgent[]>(FLEET)
  const [events, setEvents] = useState<MissionEvent[]>([])
  const [telemetry, setTelemetry] = useState<MissionTelemetry>({
    cpu: 24, memory: 41, wsLatency: 0, uptimeSec: 0, bridgeUp: false,
  })
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const startedAt = useRef<number>(Date.now())

  const pushEvent = useCallback((evt: MissionEvent) => {
    setEvents((prev) => [evt, ...prev].slice(0, 60))
  }, [])

  // Try to connect to bridge; fall back to simulation
  useEffect(() => {
    if (typeof window === 'undefined') return

    let closed = false
    try {
      const ws = new WebSocket('ws://localhost:4000')
      wsRef.current = ws

      ws.onopen = () => {
        if (closed) return
        setConnected(true)
        setTelemetry((t) => ({ ...t, bridgeUp: true }))
      }

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '{}')
          if (data?.type === 'event' && data.agentId) {
            pushEvent({
              id: makeId(),
              timestamp: Date.now(),
              agentId: String(data.agentId),
              agentLabel: String(data.agentLabel ?? data.agentId).toUpperCase(),
              kind: (data.kind ?? 'message') as MissionEvent['kind'],
              text: String(data.text ?? ''),
            })
          }
        } catch {
          /* ignore malformed frames */
        }
      }

      ws.onerror = () => {
        setConnected(false)
        setTelemetry((t) => ({ ...t, bridgeUp: false }))
      }
      ws.onclose = () => {
        setConnected(false)
        setTelemetry((t) => ({ ...t, bridgeUp: false }))
      }
    } catch {
      setConnected(false)
    }

    return () => {
      closed = true
      try { wsRef.current?.close() } catch { /* noop */ }
    }
  }, [pushEvent])

  // Simulated stream — always running so HUD never feels dead
  useEffect(() => {
    const interval = setInterval(() => {
      const tpl = FEED_ACTIONS[Math.floor(Math.random() * FEED_ACTIONS.length)]
      pushEvent({ ...tpl, id: makeId(), timestamp: Date.now() })

      // Bump that agent's latency / lastAction
      setAgents((prev) =>
        prev.map((a) =>
          a.id === tpl.agentId
            ? {
                ...a,
                latencyMs: Math.max(28, Math.round(a.latencyMs * 0.7 + Math.random() * 240)),
                lastAction: tpl.text.slice(0, 56),
                status: tpl.kind === 'task' ? 'busy' : a.status,
              }
            : a,
        ),
      )
    }, 2400)

    return () => clearInterval(interval)
  }, [pushEvent])

  // Telemetry tick
  useEffect(() => {
    const id = setInterval(() => {
      setTelemetry((t) => ({
        cpu: Math.max(8, Math.min(96, t.cpu + (Math.random() - 0.5) * 14)),
        memory: Math.max(18, Math.min(92, t.memory + (Math.random() - 0.5) * 6)),
        wsLatency: t.bridgeUp ? Math.round(30 + Math.random() * 60) : Math.round(80 + Math.random() * 220),
        uptimeSec: Math.floor((Date.now() - startedAt.current) / 1000),
        bridgeUp: t.bridgeUp,
      }))
    }, 1500)
    return () => clearInterval(id)
  }, [])

  return { agents, events, telemetry, connected }
}
