'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MissionTask, TaskPriority } from '@/lib/missionTasks'

interface UseMissionTasksReturn {
  tasks:    MissionTask[]
  counts:   { total: number; open: number; in_progress: number; done: number; blocked: number; revenue: number }
  loading:  boolean
  error:    string | null
  create:   (input: { title: string; description?: string; assignedTo?: string; priority?: TaskPriority; revenue?: boolean }) => Promise<void>
  update:   (id: string, patch: Partial<MissionTask>) => Promise<void>
  reload:   () => Promise<void>
}

const EMPTY_COUNTS = { total: 0, open: 0, in_progress: 0, done: 0, blocked: 0, revenue: 0 }

export function useMissionTasks(pollMs: number = 2000): UseMissionTasksReturn {
  const [tasks, setTasks] = useState<MissionTask[]>([])
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/mission/tasks', { cache: 'no-store' })
      if (!res.ok) throw new Error(`tasks ${res.status}`)
      const data = (await res.json()) as { ok: boolean; tasks: MissionTask[]; counts: typeof EMPTY_COUNTS }
      setTasks(data.tasks ?? [])
      setCounts(data.counts ?? EMPTY_COUNTS)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'tasks error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    timerRef.current = setInterval(reload, pollMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [reload, pollMs])

  const create = useCallback(
    async (input: { title: string; description?: string; assignedTo?: string; priority?: TaskPriority; revenue?: boolean }) => {
      const res = await fetch('/api/mission/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`create ${res.status}`)
      await reload()
    },
    [reload],
  )

  const update = useCallback(
    async (id: string, patch: Partial<MissionTask>) => {
      const res = await fetch(`/api/mission/tasks?id=${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`patch ${res.status}`)
      await reload()
    },
    [reload],
  )

  return { tasks, counts, loading, error, create, update, reload }
}
