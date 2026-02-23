'use client'

import { useEffect } from 'react'

export default function GlobalError({
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
    <html>
      <body style={{ background: '#000', margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#fff', fontFamily: 'monospace' }}>
          <div style={{ color: '#00F2FF', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Critical Error
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>
            Something went wrong.
          </h2>
          <button
            onClick={reset}
            style={{ fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(0,242,255,0.4)', color: '#00F2FF', background: 'transparent', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
