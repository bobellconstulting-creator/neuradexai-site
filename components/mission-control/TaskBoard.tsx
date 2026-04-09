'use client'

import { useMemo, useState } from 'react'
import { getAgent, AGENTS } from '@/lib/agents'
import { useMissionTasks } from '@/lib/useMissionTasks'
import type { MissionTask, TaskPriority } from '@/lib/missionTasks'

const STATUS_GLYPH: Record<MissionTask['status'], string> = {
  open:        '◌',
  in_progress: '◐',
  done:        '●',
  blocked:     '!',
}

const STATUS_COLOR: Record<MissionTask['status'], string> = {
  open:        '#efb356',
  in_progress: '#00d4ff',
  done:        '#22c55e',
  blocked:     '#ff6060',
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: 'CRIT',
  high:     'HIGH',
  medium:   'MED',
  low:      'LOW',
}

function TaskRow({ task }: { task: MissionTask }) {
  const agent = task.assignedTo !== 'unassigned' ? getAgent(task.assignedTo) : undefined
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      className="mc-slide-in px-2 py-1.5 rounded border cursor-pointer transition-colors"
      style={{
        borderColor: task.revenue ? 'rgba(34,197,94,0.30)' : 'rgba(0,212,255,0.12)',
        background: task.revenue ? 'rgba(34,197,94,0.04)' : 'rgba(0,212,255,0.02)',
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mc-mono text-sm pt-0.5 shrink-0"
          style={{ color: STATUS_COLOR[task.status] }}
        >
          {STATUS_GLYPH[task.status]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-sand mc-mono truncate flex-1">{task.title}</span>
            {task.revenue && (
              <span className="mc-mono text-[9px] tracking-widest text-[#22c55e] shrink-0">$</span>
            )}
            <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] shrink-0">
              {PRIORITY_LABEL[task.priority]}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {agent ? (
              <span
                className="mc-mono text-[9px] tracking-widest"
                style={{ color: agent.color }}
              >
                @{agent.label}
              </span>
            ) : (
              <span className="mc-mono text-[9px] text-[var(--mc-text-mute)]">UNASSIGNED</span>
            )}
            {task.proof && (
              <a
                href={task.proof.startsWith('http') ? task.proof : undefined}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mc-mono text-[9px] text-[var(--mc-cyan)] underline truncate max-w-[120px]"
              >
                {task.proof.startsWith('http') ? 'proof →' : task.proof.slice(0, 30)}
              </a>
            )}
          </div>
          {expanded && task.description && (
            <div className="mt-2 text-[10px] text-sand-dim mc-mono whitespace-pre-wrap">
              {task.description}
            </div>
          )}
          {expanded && task.agentReport && (
            <div
              className="mt-2 text-[10px] mc-mono whitespace-pre-wrap border-l-2 pl-2"
              style={{ color: STATUS_COLOR[task.status], borderColor: STATUS_COLOR[task.status] }}
            >
              {task.agentReport}
            </div>
          )}
          {expanded && task.blockedReason && (
            <div className="mt-1 text-[10px] mc-mono text-[#ff6060]">
              → {task.blockedReason}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function TaskBoard() {
  const { tasks, counts, create, loading, error } = useMissionTasks(2000)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState<string>('unassigned')
  const [revenue, setRevenue] = useState(true)
  const [priority, setPriority] = useState<TaskPriority>('high')
  const [submitting, setSubmitting] = useState(false)

  const grouped = useMemo(() => {
    return {
      open:        tasks.filter((t) => t.status === 'open'),
      in_progress: tasks.filter((t) => t.status === 'in_progress'),
      done:        tasks.filter((t) => t.status === 'done').slice(0, 10),
      blocked:     tasks.filter((t) => t.status === 'blocked'),
    }
  }, [tasks])

  const handleCreate = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await create({ title: title.trim(), assignedTo: assignee, priority, revenue })
      setTitle('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mc-panel mc-corners h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)]">
        <span className="mc-label mc-label-brass">TASK BOARD</span>
        <div className="flex items-center gap-2">
          {loading && <span className="mc-label text-[var(--mc-text-mute)]">SYNC</span>}
          {error && <span className="mc-label text-[#ff6060]">ERR</span>}
          <span className="mc-label text-[#22c55e]">${counts.revenue}</span>
          <span className="mc-label">{counts.total.toString().padStart(3, '0')}</span>
        </div>
      </div>

      {/* Compose */}
      <div className="px-3 py-2 border-b border-[var(--mc-border)] space-y-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          placeholder="New task — e.g. 'scrape 20 landowner emails'"
          className="w-full bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-2 py-1 mc-mono text-[11px] text-sand placeholder:text-[var(--mc-text-mute)] focus:outline-none focus:border-[var(--mc-cyan)]"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-1.5 py-1 mc-mono text-[9px] text-sand focus:outline-none focus:border-[var(--mc-cyan)]"
          >
            <option value="unassigned">UNASSIGNED</option>
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.label}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-1.5 py-1 mc-mono text-[9px] text-sand focus:outline-none focus:border-[var(--mc-cyan)]"
          >
            <option value="critical">CRIT</option>
            <option value="high">HIGH</option>
            <option value="medium">MED</option>
            <option value="low">LOW</option>
          </select>
          <label className="flex items-center gap-1 mc-mono text-[9px] text-[#22c55e] cursor-pointer">
            <input
              type="checkbox"
              checked={revenue}
              onChange={(e) => setRevenue(e.target.checked)}
              className="accent-[#22c55e]"
            />
            $REV
          </label>
          <button
            onClick={handleCreate}
            disabled={submitting || !title.trim()}
            className="ml-auto mc-mono text-[10px] tracking-widest px-2.5 py-1 border border-[var(--mc-cyan)] text-[var(--mc-cyan)] rounded hover:bg-[rgba(0,212,255,0.10)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? '…' : 'DROP'}
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-2 space-y-3">
        {(['in_progress', 'open', 'blocked', 'done'] as const).map((col) => {
          const items = grouped[col]
          const label =
            col === 'in_progress' ? 'IN PROGRESS' :
            col === 'open'        ? 'OPEN' :
            col === 'blocked'     ? 'BLOCKED' :
                                    'DONE · 10'
          if (items.length === 0 && col !== 'open') return null
          return (
            <div key={col}>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="mc-label"
                  style={{ color: STATUS_COLOR[col] }}
                >
                  {label}
                </span>
                <span className="mc-label">{items.length}</span>
              </div>
              <div className="space-y-1">
                {items.length === 0 && col === 'open' && (
                  <div className="mc-label text-[var(--mc-text-mute)] text-center py-2">
                    QUEUE EMPTY — DROP A TASK
                  </div>
                )}
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
