'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting_approval' | 'speaking' | 'offline'

export interface ToolCall {
  id: string
  tool: string
  args: Record<string, unknown>
  requiresApproval: boolean
  status: 'pending' | 'approved' | 'denied' | 'done'
  result?: unknown
}

export interface JarvisWSMessage {
  id: string
  role: 'user' | 'jarvis'
  content: string
  ts: number
  toolCalls?: ToolCall[]
}

export interface UseJarvisWSReturn {
  connected: boolean
  state: AgentState
  messages: JarvisWSMessage[]
  streamingText: string
  pendingToolCalls: ToolCall[]
  send: (content: string) => void
  approve: (toolCallId: string) => void
  deny: (toolCallId: string) => void
  setMode: (mode: 'read_only' | 'approval' | 'action') => void
  mode: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_JARVIS_WS_URL ?? 'ws://localhost:8765/ws'

export function useJarvisWS(): UseJarvisWSReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [connected, setConnected]         = useState(false)
  const [state, setState]                 = useState<AgentState>('offline')
  const [messages, setMessages]           = useState<JarvisWSMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([])
  const [mode, setModeState]              = useState('approval')

  // current streaming message accumulator
  const streamBuf = useRef('')
  const currentMsgId = useRef('')

  const send = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const msgId = `${Date.now()}-user`
    setMessages(prev => [...prev, { id: msgId, role: 'user', content, ts: Date.now() }])

    // Prime a jarvis response slot
    const jarvisMsgId = `${Date.now()}-jarvis`
    currentMsgId.current = jarvisMsgId
    streamBuf.current = ''
    setStreamingText('')

    wsRef.current.send(JSON.stringify({ type: 'message', content }))
  }, [])

  const approve = useCallback((toolCallId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'approve', tool_call_id: toolCallId }))
    setPendingToolCalls(prev => prev.map(tc => tc.id === toolCallId ? { ...tc, status: 'approved' } : tc))
  }, [])

  const deny = useCallback((toolCallId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'deny', tool_call_id: toolCallId }))
    setPendingToolCalls(prev => prev.map(tc => tc.id === toolCallId ? { ...tc, status: 'denied' } : tc))
  }, [])

  const setMode = useCallback((newMode: 'read_only' | 'approval' | 'action') => {
    wsRef.current?.send(JSON.stringify({ type: 'set_mode', mode: newMode }))
    setModeState(newMode)
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(BACKEND_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setState('idle')
    }

    ws.onclose = () => {
      setConnected(false)
      setState('offline')
      // Reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (evt) => {
      let data: Record<string, unknown>
      try { data = JSON.parse(evt.data) } catch { return }

      const type = data.type as string

      switch (type) {
        case 'connected':
          setState('idle')
          setModeState(data.mode as string)
          // Add welcome message
          setMessages(prev => [...prev, {
            id: 'welcome',
            role: 'jarvis',
            content: data.message as string,
            ts: Date.now()
          }])
          break

        case 'status':
          setState(data.state as AgentState)
          break

        case 'token':
          streamBuf.current += data.content as string
          setStreamingText(streamBuf.current)
          break

        case 'tool_call': {
          const tc: ToolCall = {
            id: data.id as string,
            tool: data.tool as string,
            args: (data.args ?? {}) as Record<string, unknown>,
            requiresApproval: data.requires_approval as boolean,
            status: data.requires_approval ? 'pending' : 'approved',
          }
          setPendingToolCalls(prev => [...prev, tc])
          break
        }

        case 'tool_result': {
          const id = data.id as string
          setPendingToolCalls(prev =>
            prev.map(tc => tc.id === id ? { ...tc, status: 'done', result: data.result } : tc)
          )
          break
        }

        case 'done': {
          const finalText = streamBuf.current || (data.content as string) || ''
          if (finalText) {
            setMessages(prev => [...prev, {
              id: currentMsgId.current || `${Date.now()}-jarvis`,
              role: 'jarvis',
              content: finalText,
              ts: Date.now(),
              toolCalls: pendingToolCalls.filter(tc => tc.status === 'done' || tc.status === 'denied'),
            }])
          }
          streamBuf.current = ''
          setStreamingText('')
          setPendingToolCalls([])
          setState('idle')
          break
        }

        case 'mode_changed':
          setModeState(data.mode as string)
          break

        case 'error':
          setState('idle')
          setMessages(prev => [...prev, {
            id: `${Date.now()}-err`,
            role: 'jarvis',
            content: `⚠ Error: ${data.message}`,
            ts: Date.now()
          }])
          break
      }
    }
  }, [pendingToolCalls])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, state, messages, streamingText, pendingToolCalls, send, approve, deny, setMode, mode }
}
