'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-neural-black flex items-center justify-center px-4">
      <div className="text-center">
        <div className="font-mono text-neural-cyan text-xs tracking-[0.3em] uppercase mb-4">
          System Error
        </div>
        <h2 className="font-display font-black text-2xl text-neural-text mb-4">
          Something went wrong.
        </h2>
        <button
          onClick={reset}
          className="font-mono text-xs tracking-[0.2em] uppercase px-6 py-2.5 rounded-lg border border-neural-cyan/40 text-neural-cyan hover:bg-neural-cyan/10 transition-colors duration-200"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
