'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MissionPipeline } from '@/types/mission-pipeline'

interface UseMissionPipelinesOptions {
  pollMs?: number
  filter?: 'active' | 'all'
}

interface UseMissionPipelinesReturn {
  pipelines: MissionPipeline[]
  active:    MissionPipeline | null
  loading:   boolean
  error:     string | null
  create:    (input: { title: string; steps: string[]; template?: string }) => Promise<MissionPipeline>
  cancel:    (id: string) => Promise<void>
  reload:    () => Promise<void>
}

interface PipelinesResponse {
  success:   boolean
  pipelines: MissionPipeline[]
  error?:    string
}

interface PipelineResponse {
  success:  boolean
  pipeline: MissionPipeline
  error?:   string
}

function isActive(p: MissionPipeline): boolean {
  return p.status === 'running' || p.status === 'queued'
}

export function useMissionPipelines(opts: UseMissionPipelinesOptions = {}): UseMissionPipelinesReturn {
  const { filter = 'all' } = opts
  const [pipelines, setPipelines] = useState<MissionPipeline[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/mission/pipeline', { cache: 'no-store' })
      if (!res.ok) throw new Error(`pipelines ${res.status}`)
      const data = (await res.json()) as PipelinesResponse
      const list = data.pipelines ?? []
      const next = filter === 'active' ? list.filter(isActive) : list
      setPipelines(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'pipelines error')
    } finally {
      setLoading(false)
    }
  }, [filter])

  // Derived "active" pipeline — first running/queued entry (newest first).
  const active = useMemo<MissionPipeline | null>(() => {
    return pipelines.find(isActive) ?? null
  }, [pipelines])

  // Poll faster when there's an active pipeline, slower when idle.
  const effectivePoll = useMemo<number>(() => {
    if (typeof opts.pollMs === 'number') return opts.pollMs
    return active ? 1000 : 5000
  }, [opts.pollMs, active])

  useEffect(() => {
    void reload()
    timerRef.current = setInterval(() => {
      void reload()
    }, effectivePoll)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [reload, effectivePoll])

  const create = useCallback(
    async (input: { title: string; steps: string[]; template?: string }): Promise<MissionPipeline> => {
      const res = await fetch('/api/mission/pipeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`create ${res.status}`)
      const data = (await res.json()) as PipelineResponse
      await reload()
      return data.pipeline
    },
    [reload],
  )

  const cancel = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch('/api/mission/pipeline', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, action: 'cancel' }),
      })
      if (!res.ok) throw new Error(`cancel ${res.status}`)
      await reload()
    },
    [reload],
  )

  return { pipelines, active, loading, error, create, cancel, reload }
}
