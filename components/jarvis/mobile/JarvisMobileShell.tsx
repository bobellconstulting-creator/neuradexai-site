'use client'

import Link from 'next/link'
import { Mic, MessageSquare, Calendar, CheckSquare, FileText, LayoutDashboard } from 'lucide-react'

type Tab = 'voice' | 'chat' | 'calendar' | 'tasks' | 'docs'

interface JarvisMobileShellProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  isListening: boolean
  isSpeaking: boolean
  isThinking: boolean
  connected: boolean
  children: React.ReactNode
}

const TAB_CONFIG: { id: Tab; icon: React.ElementType; label: string }[] = [
  { id: 'voice',    icon: Mic,           label: 'Voice'    },
  { id: 'chat',     icon: MessageSquare, label: 'Chat'     },
  { id: 'calendar', icon: Calendar,      label: 'Calendar' },
  { id: 'tasks',    icon: CheckSquare,   label: 'Tasks'    },
  { id: 'docs',     icon: FileText,      label: 'Docs'     },
]

export default function JarvisMobileShell({
  activeTab,
  onTabChange,
  connected,
  children,
}: JarvisMobileShellProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,55,110,0.28) 0%, rgba(0,8,16,0.9) 55%, #000810 100%)',
        backgroundColor: '#000810',
      }}
    >
      {/* Top bar */}
      <div
        className="flex-none flex items-center justify-between px-4 h-11 border-b border-white/5"
        style={{ background: 'rgba(0,8,16,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <Link
          href="/mission-control"
          className="flex items-center gap-1.5 text-white/30 hover:text-white/70 transition-colors"
          aria-label="Back to Mission Control"
        >
          <LayoutDashboard size={14} />
          <span className="font-mono text-[9px] tracking-widest uppercase">MC</span>
        </Link>

        <span className="font-mono text-xs tracking-widest text-[#00D4FF]/80 uppercase">
          Jarvis
        </span>

        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-[#00D4FF]' : 'bg-red-500'}`}
            style={{ boxShadow: connected ? '0 0 6px #00D4FF' : '0 0 6px #FF3B30' }}
          />
          <span
            className={`font-mono text-[10px] tracking-widest ${connected ? 'text-[#00D4FF]/60' : 'text-red-400/60'}`}
          >
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>

      {/* Bottom nav */}
      <div
        className="flex-none flex items-center justify-around border-t border-white/5 h-14"
        style={{ background: 'rgba(0,8,16,0.98)', backdropFilter: 'blur(12px)' }}
      >
        {TAB_CONFIG.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
              aria-label={label}
            >
              <Icon
                size={20}
                className={isActive ? 'text-[#00D4FF]' : 'text-white/20'}
              />
              {isActive && (
                <span className="font-mono text-[9px] tracking-widest text-[#00D4FF]">
                  {label.toUpperCase()}
                </span>
              )}
              {isActive && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-px"
                  style={{ background: '#00D4FF', boxShadow: '0 0 4px #00D4FF' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
