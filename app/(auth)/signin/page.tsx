'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'

function SignInForm() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router      = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl  = searchParams.get('callbackUrl') ?? '/dashboard'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError('ACCESS DENIED — Invalid credentials.')
      setLoading(false)
    } else {
      router.push(callbackUrl)
      router.refresh()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      {/* Header */}
      <div className="text-center mb-10">
        <a href="/" className="inline-flex items-center gap-2 mb-6 group">
          <div className="w-9 h-9 rounded-lg bg-neural-cyan/10 border border-neural-cyan/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-neural-cyan" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-display font-black text-neural-text text-lg tracking-tight">
            Neuradex<span className="text-neural-cyan">AI</span>
          </span>
        </a>
        <h1 className="font-mono text-[#00F2FF] text-sm tracking-[0.3em] uppercase mb-1">
          BOARDROOM ACCESS
        </h1>
        <p className="text-neural-muted text-xs tracking-wider">
          Authenticated personnel only
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className="rounded-xl border border-neural-indigo-mid/40 p-6 space-y-4"
          style={{ background: 'rgba(26, 10, 60, 0.5)', backdropFilter: 'blur(12px)' }}
        >
          {/* Email */}
          <div>
            <label className="block font-mono text-[10px] text-neural-muted tracking-[0.2em] mb-1.5 uppercase">
              Identity
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="commander@neuradexai.com"
              className="w-full bg-black/40 border border-neural-indigo-mid/30 rounded-lg px-4 py-2.5 text-sm text-neural-text placeholder:text-neural-muted/30 outline-none focus:border-neural-cyan/50 focus:shadow-cyan-sm transition-all duration-200 font-mono"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block font-mono text-[10px] text-neural-muted tracking-[0.2em] mb-1.5 uppercase">
              Authorization Key
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="w-full bg-black/40 border border-neural-indigo-mid/30 rounded-lg px-4 py-2.5 text-sm text-neural-text placeholder:text-neural-muted/30 outline-none focus:border-neural-cyan/50 focus:shadow-cyan-sm transition-all duration-200 font-mono"
            />
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono text-[11px] text-red-400 tracking-wider border border-red-900/40 bg-red-950/20 rounded px-3 py-2"
            >
              ⚠ {error}
            </motion.p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-mono text-xs tracking-[0.25em] font-bold uppercase transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: loading
                ? 'rgba(0,242,255,0.1)'
                : 'linear-gradient(135deg, rgba(0,242,255,0.15) 0%, rgba(0,242,255,0.05) 100%)',
              border: '1px solid rgba(0,242,255,0.4)',
              color: '#00F2FF',
              boxShadow: loading ? 'none' : '0 0 20px rgba(0,242,255,0.15)',
            }}
          >
            {loading ? 'AUTHENTICATING...' : 'ACCESS BOARDROOM ▶'}
          </button>
        </div>

        <p className="text-center text-neural-muted/40 text-[10px] tracking-wider font-mono">
          NEURADEX AI — CLASSIFIED OPERATIONS
        </p>
      </form>
    </motion.div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
