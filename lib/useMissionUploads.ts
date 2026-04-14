'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Canonical upload record — shared between:
 *   - POST /api/mission/upload
 *   - GET  /api/mission/files
 *   - GET  /api/mission/files/[filename]
 *   - components/mission-control/FileDropzone
 */
export interface UploadRecord {
  id: string
  name: string
  originalName: string
  size: number
  kind: 'image' | 'video' | 'doc' | 'other'
  url: string
  uploadedAt: number
  absPath: string
}

interface ListResponse {
  success: boolean
  uploads?: UploadRecord[]
  error?: string
}

interface UploadResponse {
  success: boolean
  uploads?: UploadRecord[]
  error?: string
}

export interface UseMissionUploadsReturn {
  uploads: UploadRecord[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  upload: (files: File[]) => Promise<void>
}

export function useMissionUploads(): UseMissionUploadsReturn {
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/mission/files', { cache: 'no-store' })
      if (!res.ok) throw new Error(`files ${res.status}`)
      const data = (await res.json()) as ListResponse
      setUploads(data.uploads ?? [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'files error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upload = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) return
      const form = new FormData()
      for (const f of files) {
        form.append('files', f, f.name)
      }
      const res = await fetch('/api/mission/upload', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        let detail = ''
        try {
          const data = (await res.json()) as UploadResponse
          detail = data.error ?? ''
        } catch {
          // Non-JSON response — fall through with empty detail.
        }
        throw new Error(`upload ${res.status}${detail ? `: ${detail}` : ''}`)
      }
      await refresh()
    },
    [refresh],
  )

  return { uploads, loading, error, refresh, upload }
}
