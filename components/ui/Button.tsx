import { ReactNode } from 'react'
import { clsx } from 'clsx'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  href?: string
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  onClick,
  type = 'button',
  disabled,
  href,
}: ButtonProps) {
  const base = clsx(
    'inline-flex items-center justify-center gap-2 font-semibold tracking-wide transition-all duration-300 rounded-xl',
    'focus:outline-none focus:ring-2 focus:ring-neural-cyan/50 focus:ring-offset-2 focus:ring-offset-neural-dark',
    disabled && 'opacity-50 cursor-not-allowed',
    size === 'sm' && 'px-4 py-2 text-sm',
    size === 'md' && 'px-6 py-3 text-base',
    size === 'lg' && 'px-8 py-4 text-lg',
    variant === 'primary' && [
      'bg-neural-cyan text-neural-black',
      'hover:bg-neural-cyan-dim hover:shadow-cyan-lg',
      'active:scale-[0.98]',
      'animate-[glowPulse_2s_ease-in-out_infinite]',
    ],
    variant === 'ghost' && [
      'bg-transparent text-neural-cyan border border-neural-cyan/40',
      'hover:bg-neural-cyan/10 hover:border-neural-cyan hover:shadow-cyan-sm',
    ],
    variant === 'outline' && [
      'bg-transparent text-neural-text border border-neural-indigo-mid/60',
      'hover:border-neural-cyan/40 hover:text-neural-cyan',
    ],
    className
  )

  if (href) {
    return (
      <a href={href} className={base}>
        {children}
      </a>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base}>
      {children}
    </button>
  )
}
