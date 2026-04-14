'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { MissionIdea } from '@/types/mission-idea'

interface UseMissionIdeasReturn {
  ideas:   MissionIdea[]
  loading: boolean
  error:   string | null
  create:  (input: {
    agentId: string
    title:   string
    body:    string
    tags?:   string[]
  }) => Promise<MissionIdea>
  update:  (id: string, patch: Partial<MissionIdea>) => Promise<MissionIdea>
  remove:  (id: string) => Promise<void>
  reload:  () => Promise<void>
}

interface UseMissionIdeasOptions {
  agentId?: string
  pollMs?:  number
}

interface IdeasResponse {
  success: boolean
  ideas:   MissionIdea[]
  error?:  string
}

interface IdeaResponse {
  success: boolean
  idea:    MissionIdea
  error?:  string
}

export function useMissionIdeas(opts: UseMissionIdeasOptions = {}): UseMissionIdeasReturn {
  const { agentId, pollMs = 3000 } = opts
  const [ideas, setIdeas] = useState<MissionIdea[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const url = agentId
        ? `/api/mission/ideas?agent=${encodeURIComponent(agentId)}`
        : '/api/mission/ideas'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`ideas ${res.status}`)
      const data = (await res.json()) as IdeasResponse
      setIdeas(data.ideas ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ideas error')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    void reload()
    timerRef.current = setInterval(() => {
      void reload()
    }, pollMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [reload, pollMs])

  const create = useCallback(
    async (input: {
      agentId: string
      title:   string
      body:    string
      tags?:   string[]
    }): Promise<MissionIdea> => {
      const res = await fetch('/api/mission/ideas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`create ${res.status}`)
      const data = (await res.json()) as IdeaResponse
      await reload()
      return data.idea
    },
    [reload],
  )

  const update = useCallback(
    async (id: string, patch: Partial<MissionIdea>): Promise<MissionIdea> => {
      const res = await fetch('/api/mission/ideas', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, ...patch }),
      })
      if (!res.ok) throw new Error(`patch ${res.status}`)
      const data = (await res.json()) as IdeaResponse
      await reload()
      return data.idea
    },
    [reload],
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch('/api/mission/ideas', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error(`delete ${res.status}`)
      await reload()
    },
    [reload],
  )

  return { ideas, loading, error, create, update, remove, reload }
}
