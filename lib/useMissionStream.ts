'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MissionMessage } from '@/lib/missionStream'

interface UseMissionStreamOptions {
  agentId?: string         // filter view to one agent
  pollMs?:  number         // default 2000
}

interface UseMissionStreamReturn {
  messages: MissionMessage[]
  loading:  boolean
  error:    string | null
  send:     (content: string) => Promise<void>
  sending:  boolean
}

export function useMissionStream(opts: UseMissionStreamOptions = {}): UseMissionStreamReturn {
  const { agentId, pollMs = 2000 } = opts
  const [messages, setMessages] = useState<MissionMessage[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<boolean>(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const qs = agentId ? `?agent=${encodeURIComponent(agentId)}` : ''
      const res = await fetch(`/api/mission/stream${qs}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`stream ${res.status}`)
      const data = (await res.json()) as { ok: boolean; messages: MissionMessage[] }
      setMessages(data.messages ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'stream error')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, pollMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchAll, pollMs])

  const send = useCallback(async (content: string) => {
    if (!content.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/mission/broadcast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(`broadcast ${res.status}`)
      await fetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send failed')
    } finally {
      setSending(false)
    }
  }, [fetchAll])

  return { messages, loading, error, send, sending }
}
