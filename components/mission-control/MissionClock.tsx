'use client'

import { useEffect, useState } from 'react'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function MissionClock() {
  const [now, setNow] = useState<Date | null>(null)
  const [startedAt] = useState<number>(() => Date.now())

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) {
    return (
      <div className="flex items-center gap-3 mc-mono text-sand">
        <span className="mc-label mc-label-brass">UTC</span>
        <span className="text-base tracking-widest">--:--:--</span>
      </div>
    )
  }

  const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
  const local = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const elapsedMs = Date.now() - startedAt
  const eh = Math.floor(elapsedMs / 3_600_000)
  const em = Math.floor((elapsedMs % 3_600_000) / 60_000)
  const es = Math.floor((elapsedMs % 60_000) / 1000)

  return (
    <div className="flex items-center gap-6 mc-mono">
      <div className="flex flex-col items-end leading-none">
        <span className="mc-label mc-label-brass">UTC</span>
        <span className="text-lg tracking-widest text-sand">{utc}</span>
      </div>
      <div className="flex flex-col items-end leading-none">
        <span className="mc-label">LOCAL · CT</span>
        <span className="text-base tracking-widest text-sand-dim">{local}</span>
      </div>
      <div className="flex flex-col items-end leading-none">
        <span className="mc-label">SESSION</span>
        <span className="text-base tracking-widest text-[var(--mc-cyan)]">
          {pad(eh)}:{pad(em)}:{pad(es)}
        </span>
      </div>
    </div>
  )
}
