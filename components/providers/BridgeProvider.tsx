'use client'

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id:        string
  role:      'user' | 'agent'
  content:   string
  streaming: boolean
  ts:        number
}

export type AgentStatus = 'idle' | 'thinking' | 'responding'
export type BridgeStatus = 'disconnected' | 'connecting' | 'connected'

export interface BridgeContextValue {
  messages:      Record<string, Message[]>
  agentStatuses: Record<string, AgentStatus>
  bridgeStatus:  BridgeStatus
  sendMessage:   (agentId: string, content: string) => void
  clearMessages: (agentId: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const BridgeContext = createContext<BridgeContextValue | null>(null)

// ─── Mock streaming (used when NEXT_PUBLIC_BRIDGE_URL is not set) ─────────────

const MOCK_STUBS = [
  'Acknowledged. Analyzing directive now...',
  'Processing your request. Stand by for output.',
  'Confirmed. Executing protocol sequence.',
  'Input registered. Calibrating response matrix.',
  'Directive received. Engaging subsystems.',
]

async function* mockStream(agentLabel: string): AsyncGenerator<string> {
  const text = `[${agentLabel}] ${MOCK_STUBS[Math.floor(Math.random() * MOCK_STUBS.length)]}`
  await new Promise((r) => setTimeout(r, 600))
  for (const char of text) {
    yield char
    await new Promise((r) => setTimeout(r, 18))
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [bridgeStatus,  setBridgeStatus]  = useState<BridgeStatus>('disconnected')
  const [messages,      setMessages]      = useState<Record<string, Message[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})

  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL
  const isMockMode = !bridgeUrl

  // ── Helpers ────────────────────────────────────────────────────────────────

  const appendToken = useCallback((agentId: string, token: string) => {
    setMessages((prev) => {
      const msgs = prev[agentId] ?? []
      const last = msgs[msgs.length - 1]
      if (last?.streaming) {
        return {
          ...prev,
          [agentId]: [
            ...msgs.slice(0, -1),
            { ...last, content: last.content + token },
          ],
        }
      }
      // Start a new streaming bubble
      const newMsg: Message = {
        id:        `${Date.now()}-a`,
        role:      'agent',
        content:   token,
        streaming: true,
        ts:        Date.now(),
      }
      return { ...prev, [agentId]: [...msgs, newMsg] }
    })
  }, [])

  const finalizeStream = useCallback((agentId: string) => {
    setMessages((prev) => {
      const msgs = prev[agentId] ?? []
      return {
        ...prev,
        [agentId]: msgs.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      }
    })
    setAgentStatuses((prev) => ({ ...prev, [agentId]: 'idle' }))
  }, [])

  // ── Mock send ─────────────────────────────────────────────────────────────

  const mockSend = useCallback(async (agentId: string, content: string) => {
    const userMsg: Message = {
      id:        `${Date.now()}-u`,
      role:      'user',
      content,
      streaming: false,
      ts:        Date.now(),
    }
    setMessages((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), userMsg],
    }))
    setAgentStatuses((prev) => ({ ...prev, [agentId]: 'thinking' }))

    // MOCK: import agent label lazily to avoid circular dependency
    const { getAgent } = await import('@/lib/agents')
    const label = getAgent(agentId)?.label ?? agentId.toUpperCase()

    await new Promise((r) => setTimeout(r, 800))
    setAgentStatuses((prev) => ({ ...prev, [agentId]: 'responding' }))

    for await (const token of mockStream(label)) {
      appendToken(agentId, token)
    }
    finalizeStream(agentId)
  }, [appendToken, finalizeStream])

  // ── Real WS connect ───────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!bridgeUrl || sessionStatus !== 'authenticated') return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setBridgeStatus('connecting')

    // Fetch a short-lived token from our API
    let token: string
    try {
      const res = await fetch('/api/bridge-token')
      if (!res.ok) throw new Error('token fetch failed')
      ;({ token } = await res.json())
    } catch {
      console.error('[Bridge] Could not obtain bridge token')
      setBridgeStatus('disconnected')
      return
    }

    const ws = new WebSocket(`${bridgeUrl}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => {
      setBridgeStatus('connected')
      console.log('[Bridge] Connected')
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        switch (msg.type) {
          case 'token':
            setAgentStatuses((prev) => ({ ...prev, [msg.agentId]: 'responding' }))
            appendToken(msg.agentId, msg.content ?? '')
            break
          case 'done':
            finalizeStream(msg.agentId)
            break
          case 'status':
            setAgentStatuses((prev) => ({ ...prev, [msg.agentId]: msg.status }))
            break
          case 'error':
            console.error(`[Bridge:${msg.agentId}] ${msg.message}`)
            finalizeStream(msg.agentId)
            break
          case 'pong':
            break
        }
      } catch {
        console.warn('[Bridge] Unparseable message:', ev.data)
      }
    }

    ws.onerror = (e) => {
      console.error('[Bridge] WebSocket error', e)
    }

    ws.onclose = () => {
      setBridgeStatus('disconnected')
      wsRef.current = null
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [bridgeUrl, sessionStatus, appendToken, finalizeStream])

  useEffect(() => {
    if (!isMockMode && sessionStatus === 'authenticated') {
      connect()
    }
    return () => {
      wsRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [isMockMode, sessionStatus, connect])

  // Keep-alive ping every 30s
  useEffect(() => {
    if (isMockMode) return
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30_000)
    return () => clearInterval(ping)
  }, [isMockMode])

  // ── Real WS send ──────────────────────────────────────────────────────────

  const realSend = useCallback((agentId: string, content: string) => {
    const userMsg: Message = {
      id:        `${Date.now()}-u`,
      role:      'user',
      content,
      streaming: false,
      ts:        Date.now(),
    }
    setMessages((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), userMsg],
    }))
    setAgentStatuses((prev) => ({ ...prev, [agentId]: 'thinking' }))

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'msg', agentId, content }))
    } else {
      console.warn('[Bridge] Not connected — message dropped')
      setAgentStatuses((prev) => ({ ...prev, [agentId]: 'idle' }))
    }
  }, [])

  const sendMessage = useCallback(
    (agentId: string, content: string) => {
      if (isMockMode) {
        mockSend(agentId, content)
      } else {
        realSend(agentId, content)
      }
    },
    [isMockMode, mockSend, realSend]
  )

  const clearMessages = useCallback((agentId: string) => {
    setMessages((prev) => ({ ...prev, [agentId]: [] }))
  }, [])

  return (
    <BridgeContext.Provider
      value={{
        messages,
        agentStatuses,
        bridgeStatus: isMockMode ? 'connected' : bridgeStatus,
        sendMessage,
        clearMessages,
      }}
    >
      {children}
    </BridgeContext.Provider>
  )
}
