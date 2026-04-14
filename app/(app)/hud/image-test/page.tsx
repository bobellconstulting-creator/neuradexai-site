'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/mission-control/TopBar'

interface GenResponse {
  ok: boolean
  publicUrl?: string
  mimeType?: string
  error?: string
}

interface BudgetResponse {
  ok: boolean
  used?: number
  cap?: number
  remaining?: number
  date?: string
  error?: string
}

export default function ImageTestPage() {
  const [prompt, setPrompt] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [budget, setBudget] = useState<BudgetResponse | null>(null)

  async function refreshBudget(): Promise<void> {
    try {
      const res = await fetch('/api/image/budget', { cache: 'no-store' })
      const data = (await res.json()) as BudgetResponse
      setBudget(data)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshBudget()
  }, [])

  async function handleGenerate(): Promise<void> {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    setImgUrl(null)
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio: '16:9' }),
      })
      const data = (await res.json()) as GenResponse
      if (!data.ok || !data.publicUrl) {
        setError(data.error ?? 'generation failed')
      } else {
        setImgUrl(data.publicUrl)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'network error')
    } finally {
      setLoading(false)
      void refreshBudget()
    }
  }

  return (
    <div className="min-h-screen bg-black text-cyan-100">
      <TopBar bridgeUp={true} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/hud"
            className="mc-mono text-xs uppercase tracking-widest text-cyan-400 hover:text-cyan-200"
          >
            &larr; HUD
          </Link>
          <div className="mc-mono text-xs uppercase tracking-widest text-cyan-500/70">
            {budget?.ok
              ? `BUDGET ${budget.used ?? 0}/${budget.cap ?? 20} · ${budget.remaining ?? 0} LEFT`
              : 'BUDGET —'}
          </div>
        </div>

        <div className="mc-panel mc-corners p-6">
          <h1 className="mc-mono mb-4 text-lg uppercase tracking-[0.25em] text-cyan-300">
            NANO BANANA 2 // IMAGE GEN TEST
          </h1>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image…"
            rows={3}
            className="mc-mono w-full resize-none rounded border border-cyan-900/60 bg-black/60 p-3 text-sm text-cyan-100 outline-none focus:border-cyan-500"
          />

          <button
            onClick={() => void handleGenerate()}
            disabled={loading || !prompt.trim()}
            className="mc-mono mt-4 rounded border border-cyan-500 bg-cyan-500/10 px-6 py-2 text-xs uppercase tracking-widest text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'GENERATING…' : 'GENERATE'}
          </button>

          {error && (
            <div className="mc-mono mt-4 rounded border border-red-500/60 bg-red-900/20 p-3 text-xs text-red-300">
              ERROR: {error}
            </div>
          )}

          {imgUrl && (
            <div className="mt-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgUrl}
                alt={prompt}
                className="w-full rounded border border-cyan-900/60"
              />
              <div className="mc-mono mt-2 text-[10px] uppercase tracking-widest text-cyan-600">
                {imgUrl}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
