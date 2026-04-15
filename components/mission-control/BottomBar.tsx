'use client'
import { SystemStatusPills } from './SystemStatusPills'

export function BottomBar() {
  return (
    <footer className="relative z-10 flex items-center gap-4 px-6 py-2 border-t border-[var(--mc-border)] bg-[rgba(5,7,20,0.7)] backdrop-blur-md">
      <span className="mc-label mc-label-brass hidden sm:block">SYSTEMS</span>
      <SystemStatusPills />
    </footer>
  )
}
