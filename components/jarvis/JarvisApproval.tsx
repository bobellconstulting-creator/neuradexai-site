'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { ToolCall } from '@/hooks/useJarvisWS'

interface JarvisApprovalProps {
  pendingToolCalls: ToolCall[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

const TOOL_ICONS: Record<string, string> = {
  run_command:   '⚡',
  write_file:    '✏️',
  delete_file:   '🗑',
  read_file:     '📄',
  list_directory:'📁',
  take_screenshot:'📸',
  get_system_info:'🖥',
  web_search:    '🔍',
}

export default function JarvisApproval({ pendingToolCalls, onApprove, onDeny }: JarvisApprovalProps) {
  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4 space-y-2">
      <AnimatePresence>
        {pendingToolCalls.map(tc => (
          <motion.div
            key={tc.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="rounded-lg border font-mono overflow-hidden"
            style={{
              background:   'rgba(0,6,18,0.97)',
              borderColor:  'rgba(255,140,0,0.5)',
              boxShadow:    '0 0 20px rgba(255,140,0,0.15), 0 4px 24px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#FF8C00]/20">
              <div className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
              <span className="text-[10px] tracking-[0.2em] text-[#FF8C00]">APPROVAL REQUIRED</span>
              <span className="ml-auto text-lg">{TOOL_ICONS[tc.tool] ?? '🔧'}</span>
            </div>

            {/* Tool info */}
            <div className="px-4 py-3">
              <div className="text-[11px] text-[#00D4FF] tracking-wider mb-1">{tc.tool}</div>
              <pre className="text-[10px] text-[#e2e8f0]/60 whitespace-pre-wrap break-all leading-relaxed max-h-24 overflow-y-auto">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-4 pb-3">
              <button
                onClick={() => onApprove(tc.id)}
                className="flex-1 py-1.5 text-[10px] tracking-[0.18em] border border-emerald-500/50 text-emerald-400 rounded hover:bg-emerald-500/10 transition-all"
              >
                ✓ AUTHORIZE
              </button>
              <button
                onClick={() => onDeny(tc.id)}
                className="flex-1 py-1.5 text-[10px] tracking-[0.18em] border border-red-500/40 text-red-400 rounded hover:bg-red-500/10 transition-all"
              >
                ✗ DENY
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
