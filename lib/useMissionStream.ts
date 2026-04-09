'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChannelId, MissionMessage } from '@/lib/missionChannels'

interface UseMissionStreamOptions {
  agentId?: string         // legacy — uses agent's office + own turns
  channel?: ChannelId      // explicit channel (e.g. "office:bob", "boardroom")
  pollMs?:  number         // default 2000
}

interface SendOptions {
  channel?: ChannelId
}

interface UseMissionStreamReturn {
  messages: MissionMessage[]
  loading:  boolean
  error:    string | null
  send:     (content: string, opts?: SendOptions) => Promise<void>
  sending:  boolean
  share:    (messageId: string, targets: ChannelId[]) => Promise<void>
}

export function useMissionStream(opts: UseMissionStreamOptions = {}): UseMissionStreamReturn {
  const { agentId, channel, pollMs = 2000 } = opts
  const [messages, setMessages] = useState<MissionMessage[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<boolean>(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (agentId) qs.set('agent', agentId)
      if (channel) qs.set('channel', channel)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const res = await fetch(`/api/mission/stream${suffix}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`stream ${res.status}`)
      const data = (await res.json()) as { ok: boolean; messages: MissionMessage[] }
      setMessages(data.messages ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'stream error')
    } finally {
      setLoading(false)
    }
  }, [agentId, channel])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, pollMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchAll, pollMs])

  const send = useCallback(
    async (content: string, sendOpts?: SendOptions) => {
      if (!content.trim()) return
      setSending(true)
      try {
        // Default to the channel the hook is viewing
        const effectiveChannel = sendOpts?.channel ?? channel
        const res = await fetch('/api/mission/broadcast', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content, channel: effectiveChannel }),
        })
        if (!res.ok) throw new Error(`broadcast ${res.status}`)
        await fetchAll()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'send failed')
      } finally {
        setSending(false)
      }
    },
    [fetchAll, channel],
  )

  const share = useCallback(
    async (messageId: string, targets: ChannelId[]) => {
      try {
        const res = await fetch('/api/mission/share', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messageId, targets }),
        })
        if (!res.ok) throw new Error(`share ${res.status}`)
        await fetchAll()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'share failed')
      }
    },
    [fetchAll],
  )

  return { messages, loading, error, send, sending, share }
}
