'use client'

export type MCView = 'overview' | 'agents' | 'radar' | 'intel' | 'tasks' | 'systems'

interface LeftRailProps {
  active: MCView
  onChange: (v: MCView) => void
}

const NAV: Array<{ id: MCView; label: string; glyph: string }> = [
  { id: 'overview', label: 'Overview', glyph: '◇' },
  { id: 'agents',   label: 'Agents',   glyph: '⬡' },
  { id: 'radar',    label: 'Radar',    glyph: '◎' },
  { id: 'intel',    label: 'Intel',    glyph: '◈' },
  { id: 'tasks',    label: 'Tasks',    glyph: '▣' },
  { id: 'systems',  label: 'Systems',  glyph: '◉' },
]

export function LeftRail({ active, onChange }: LeftRailProps) {
  return (
    <nav className="relative z-10 flex flex-col items-stretch gap-1 px-3 py-5 border-r border-[var(--mc-border)] bg-[rgba(5,7,20,0.55)] w-[156px]">
      <div className="mc-label px-2 mb-3 text-[var(--mc-brass)]">MODULES</div>
      {NAV.map((n) => {
        const isActive = active === n.id
        return (
          <button
            key={n.id}
            onClick={() => onChange(n.id)}
            className={`relative flex items-center gap-3 px-3 py-2 rounded mc-mono text-xs tracking-widest uppercase border transition-all ${
              isActive
                ? 'bg-[rgba(0,212,255,0.10)] border-[var(--mc-cyan)] text-[var(--mc-cyan)] shadow-[0_0_18px_rgba(0,212,255,0.25)]'
                : 'border-transparent text-sand-dim hover:text-sand hover:border-[var(--mc-border)]'
            }`}
          >
            <span className="text-sm">{n.glyph}</span>
            <span>{n.label}</span>
            {isActive && (
              <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--mc-cyan)] shadow-[0_0_8px_var(--mc-cyan)]" />
            )}
          </button>
        )
      })}

      <div className="mt-auto pt-4 border-t border-[var(--mc-border)]">
        <div className="mc-label px-2 mb-2">CLEARANCE</div>
        <div className="px-2 mc-mono text-xs text-[var(--mc-brass)]">LVL-9 / FOUNDER</div>
      </div>
    </nav>
  )
}
