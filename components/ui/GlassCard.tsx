import { ReactNode } from 'react'
import { clsx } from 'clsx'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  glow?: 'cyan' | 'purple' | 'none'
}

export default function GlassCard({
  children,
  className,
  hover = true,
  glow = 'none',
}: GlassCardProps) {
  return (
    <div
      className={clsx(
        'glass',
        hover && 'transition-all duration-300 hover:-translate-y-1',
        glow === 'cyan' && 'hover:shadow-cyan-md hover:border-neural-cyan/40',
        glow === 'purple' && 'hover:shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:border-neural-purple/40',
        className
      )}
    >
      {children}
    </div>
  )
}
