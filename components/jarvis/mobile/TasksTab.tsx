'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, RefreshCw, CheckCircle, Circle, AlertCircle } from 'lucide-react'
import type { MissionTask, TaskPriority } from '@/lib/missionTasks'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface TasksTabProps {
  tasks: MissionTask[]
  loading: boolean
  onAddTask: (title: string) => Promise<void>
  onComplete: (taskId: string) => Promise<void>
  onRefresh: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// Priority config
// ──────────────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-[#00d4ff]',
  low: 'bg-white/25',
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function groupByPriority(tasks: MissionTask[]): Array<{ priority: TaskPriority; tasks: MissionTask[] }> {
  const sorted = [...tasks].sort((a, b) => {
    const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (pd !== 0) return pd
    return b.createdAt - a.createdAt
  })

  const groups: Partial<Record<TaskPriority, MissionTask[]>> = {}
  for (const task of sorted) {
    if (!groups[task.priority]) groups[task.priority] = []
    groups[task.priority]!.push(task)
  }

  const order: TaskPriority[] = ['critical', 'high', 'medium', 'low']
  return order
    .filter((p) => groups[p] && groups[p]!.length > 0)
    .map((p) => ({ priority: p, tasks: groups[p]! }))
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: MissionTask
  onComplete: (taskId: string) => Promise<void>
}

function TaskCard({ task, onComplete }: TaskCardProps) {
  const [completing, setCompleting] = useState(false)
  const isBlocked = task.status === 'blocked'
  const isDone = task.status === 'done'

  async function handleComplete() {
    if (completing || isDone) return
    setCompleting(true)
    try {
      await onComplete(task.id)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="rounded-md border border-white/8 bg-white/4 px-3 py-2.5 flex items-start gap-3"
    >
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {isDone ? (
          <CheckCircle size={15} className="text-[#00d4ff]" />
        ) : isBlocked ? (
          <AlertCircle size={15} className="text-red-400" />
        ) : (
          <Circle size={15} className="text-white/25" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[13px] text-white leading-snug truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-mono text-[10px] text-white/35 tracking-wider uppercase">
            {task.status.replace('_', ' ')}
          </span>
          {task.assignedTo && task.assignedTo !== 'unassigned' && (
            <span className="font-mono text-[10px] text-[#00d4ff]/50 uppercase tracking-wider">
              {task.assignedTo}
            </span>
          )}
          <span className="font-mono text-[10px] text-white/20">
            {formatRelativeTime(task.createdAt)}
          </span>
          {isBlocked && task.blockedReason && (
            <span className="px-1.5 py-px rounded text-[10px] font-mono bg-red-500/20 text-red-300 uppercase tracking-widest">
              BLOCKED
            </span>
          )}
        </div>
      </div>

      {/* Done button */}
      {!isDone && !isBlocked && (
        <button
          onClick={handleComplete}
          disabled={completing}
          className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase border border-[#00d4ff]/30 text-[#00d4ff]/70 hover:bg-[#00d4ff]/10 hover:text-[#00d4ff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {completing ? '…' : 'Done'}
        </button>
      )}
    </motion.div>
  )
}

interface PriorityGroupProps {
  priority: TaskPriority
  tasks: MissionTask[]
  onComplete: (taskId: string) => Promise<void>
}

function PriorityGroup({ priority, tasks, onComplete }: PriorityGroupProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-1">
        <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[priority]}`} />
        <span className="font-mono text-[10px] tracking-widest text-white/35 uppercase">
          {PRIORITY_LABEL[priority]}
        </span>
      </div>
      <AnimatePresence mode="popLayout">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onComplete={onComplete} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────

export default function TasksTab({
  tasks,
  loading,
  onAddTask,
  onComplete,
  onRefresh,
}: TasksTabProps) {
  const [inputValue, setInputValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit() {
    const title = inputValue.trim()
    if (!title || submitting) return
    setSubmitting(true)
    try {
      await onAddTask(title)
      setInputValue('')
    } finally {
      setSubmitting(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const activeTasks = tasks.filter((t) => t.status !== 'done')
  const groups = groupByPriority(activeTasks)

  return (
    <div className="flex flex-col h-full" style={{ background: '#000810' }}>
      {/* Input row — sticky top */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/6">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 focus-within:border-[#00d4ff]/40 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a task..."
              disabled={submitting}
              className="flex-1 bg-transparent font-mono text-[13px] text-white placeholder:text-white/25 outline-none disabled:opacity-50"
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={!inputValue.trim() || submitting}
              className="shrink-0 text-[#00d4ff]/60 hover:text-[#00d4ff] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              aria-label="Add task"
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 p-2 rounded-md border border-white/10 text-white/35 hover:text-white/60 hover:border-white/20 transition-colors disabled:opacity-30"
            aria-label="Refresh tasks"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && tasks.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-[11px] tracking-widest text-white/20 uppercase animate-pulse">
              Loading...
            </span>
          </div>
        )}

        {!loading && activeTasks.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-[11px] tracking-widest text-white/20 uppercase">
              No active tasks, sir.
            </span>
          </div>
        )}

        {groups.map(({ priority, tasks: groupTasks }) => (
          <PriorityGroup
            key={priority}
            priority={priority}
            tasks={groupTasks}
            onComplete={onComplete}
          />
        ))}
      </div>
    </div>
  )
}
