'use client'

import { useState } from 'react'

interface SystemDef {
  id:   string
  name: string
  url?: string
  hint: string
}

const SYSTEMS: SystemDef[] = [
  { id: 'site',     name: 'NEURADEX',  url: 'https://neuradexai.com',                hint: 'Marketing site' },
  { id: 'buckgrid', name: 'BUCKGRID',  url: 'https://codespacebuckgrid.vercel.app',  hint: 'BuckGrid Pro' },
  { id: 'jarvis',   name: 'JARVIS VPS',                                              hint: '209.97.157.87' },
  { id: 'oci',      name: 'OCI A1',                                                  hint: 'us-chicago-1' },
  { id: 'gateway',  name: 'OPENCLAW',                                                hint: 'localhost:18789' },
  { id: 'fly',      name: 'FLY.IO',    url: 'https://jarvis-bell.fly.dev',           hint: 'Jarvis web' },
]

type PingState = 'unknown' | 'pinging' | 'up' | 'down'

export function SystemStatusPills() {
  const [state, setState] = useState<Record<string, PingState>>({})

  const ping = async (sys: SystemDef, e: React.MouseEvent) => {
    e.stopPropagation()
    setState((s) => ({ ...s, [sys.id]: 'pinging' }))
    if (!sys.url) {
      window.setTimeout(() => setState((s) => ({ ...s, [sys.id]: 'unknown' })), 600)
      return
    }
    try {
      await fetch(sys.url, { mode: 'no-cors', cache: 'no-store' })
      setState((s) => ({ ...s, [sys.id]: 'up' }))
    } catch {
      setState((s) => ({ ...s, [sys.id]: 'down' }))
    }
  }

  const open = (sys: SystemDef) => {
    if (sys.url) {
      window.open(sys.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {SYSTEMS.map((sys) => {
        const st = state[sys.id] ?? 'unknown'
        const dotClass =
          st === 'up' ? 'mc-dot-on'
          : st === 'down' ? 'mc-dot-warn'
          : st === 'pinging' ? 'mc-dot-busy'
          : 'mc-dot-off'
        return (
          <div
            key={sys.id}
            title={sys.url ? `Click: open ${sys.hint} · Dot: ping` : sys.hint}
            onClick={() => open(sys)}
            className={`group flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--mc-border)] bg-[rgba(0,212,255,0.04)] hover:border-[var(--mc-cyan)] hover:bg-[rgba(0,212,255,0.10)] transition-all ${
              sys.url ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <button
              onClick={(e) => ping(sys, e)}
              className="flex items-center"
              aria-label={`Ping ${sys.name}`}
            >
              <span className={`mc-dot ${dotClass}`} />
            </button>
            <span className="mc-label group-hover:text-[var(--mc-cyan)]">{sys.name}</span>
          </div>
        )
      })}
    </div>
  )
}
