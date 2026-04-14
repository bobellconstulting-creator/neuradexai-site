'use client'

/**
 * NodeDetailCard — slide-in detail panel shown when a GraphNode is focused
 * in the constellation. Bottom sheet on mobile, pinned side panel on desktop.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { AgentConfig } from '@/lib/agents'
import type { GraphNode, NodeKind } from '@/types/agent-graph'

export interface NodeDetailCardProps {
  node:           GraphNode | null
  agent:          AgentConfig
  onClose:        () => void
  onPromoteIdea?: (ideaId: string) => void
  onOpenInChat?:  (text: string) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<NodeKind, string> = {
  identity: 'IDENTITY',
  memory:   'MEMORY',
  idea:     'IDEA',
  task:     'TASK',
  chat:     'CHAT',
  document: 'DOCUMENT',
}

function formatTs(ts: number | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    year:   'numeric',
    month:  'short',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

function defaultChatInjection(node: GraphNode): string {
  switch (node.kind) {
    case 'document': return `look at this: ${node.title}`
    case 'task':     return `status update on: ${node.title}`
    case 'idea':     return `about the idea "${node.title}" — `
    case 'memory':   return `re: ${node.title} — `
    case 'chat':     return `picking back up on: ${node.title}`
    case 'identity': return `about your role (${node.title}) — `
    default:         return `re: ${node.title}`
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function NodeDetailCard({
  node,
  agent,
  onClose,
  onPromoteIdea,
  onOpenInChat,
}: NodeDetailCardProps) {
  const router = useRouter()

  useEffect(() => {
    if (!node) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [node, onClose])

  if (!node) return null

  const kindLabel = KIND_LABEL[node.kind]
  const created = formatTs(node.createdAt)
  const sourceRefId = node.sourceRef.refId

  const handleOpenInChat = (): void => {
    if (onOpenInChat) onOpenInChat(defaultChatInjection(node))
  }

  const handlePromoteIdea = (): void => {
    if (node.kind !== 'idea') return
    if (onPromoteIdea) onPromoteIdea(node.sourceRef.refId)
  }

  const handleViewTask = (): void => {
    if (node.kind !== 'task') return
    router.push(`/mission-control/tasks/${encodeURIComponent(node.sourceRef.refId)}`)
  }

  const handleInjectDocument = (): void => {
    if (node.kind !== 'document') return
    if (onOpenInChat) onOpenInChat(`look at this: ${node.title}`)
  }

  const showPromote = node.kind === 'idea' && node.status === 'fresh'
  const showViewTask = node.kind === 'task'
  const showInjectDoc = node.kind === 'document'

  const accentColor = agent.color

  return (
    <>
      {/* ── Mobile bottom sheet ─────────────────────────────────────────── */}
      {/* Positioned well above the ChatDock (56 px collapsed bar + 72 px gap)
          so the detail card never overlaps the dock. z-index 75 wins over
          the dock's 60 if they ever brush against each other. */}
      <div
        className="lg:hidden fixed left-0 right-0 bottom-[128px] z-[75] pointer-events-none"
        aria-hidden={false}
      >
        <div
          className="mc-panel mc-corners pointer-events-auto mx-2 flex flex-col overflow-hidden nd-card-mobile"
          style={{
            borderColor: 'var(--mc-cyan)',
            borderWidth: 2,
            maxHeight: '50vh',
            boxShadow: '0 -8px 32px rgba(0,212,255,0.22)',
          }}
          role="dialog"
          aria-modal="false"
          aria-label={`Detail for ${node.title}`}
        >
          <DetailHeader
            kindLabel={kindLabel}
            title={node.title}
            color={node.color}
            onClose={onClose}
          />
          <DetailBody
            body={node.body}
            createdAt={created}
            sourceRefId={sourceRefId}
            agentLabel={agent.label}
          />
          <DetailActions
            accentColor={accentColor}
            showPromote={showPromote}
            showViewTask={showViewTask}
            showInjectDoc={showInjectDoc}
            onOpenInChat={handleOpenInChat}
            onPromoteIdea={handlePromoteIdea}
            onViewTask={handleViewTask}
            onInjectDoc={handleInjectDocument}
          />
        </div>
      </div>

      {/* ── Desktop side panel ──────────────────────────────────────────── */}
      <div
        className="hidden lg:flex fixed right-4 top-[80px] bottom-[80px] w-[380px] z-[70] flex-col mc-panel mc-corners overflow-hidden nd-card-desktop"
        style={{
          borderColor: 'var(--mc-cyan)',
          borderWidth: 2,
          boxShadow: '-8px 0 32px rgba(0,212,255,0.22)',
        }}
        role="dialog"
        aria-modal="false"
        aria-label={`Detail for ${node.title}`}
      >
        <DetailHeader
          kindLabel={kindLabel}
          title={node.title}
          color={node.color}
          onClose={onClose}
        />
        <DetailBody
          body={node.body}
          createdAt={created}
          sourceRefId={sourceRefId}
          agentLabel={agent.label}
        />
        <DetailActions
          accentColor={accentColor}
          showPromote={showPromote}
          showViewTask={showViewTask}
          showInjectDoc={showInjectDoc}
          onOpenInChat={handleOpenInChat}
          onPromoteIdea={handlePromoteIdea}
          onViewTask={handleViewTask}
          onInjectDoc={handleInjectDocument}
        />
      </div>

      <style jsx>{`
        .nd-card-mobile {
          animation: ndc-slide-up 220ms ease-out;
        }
        .nd-card-desktop {
          animation: ndc-slide-left 220ms ease-out;
        }
        @keyframes ndc-slide-up {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes ndc-slide-left {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────

interface DetailHeaderProps {
  kindLabel: string
  title:     string
  color:     string
  onClose:   () => void
}

function DetailHeader({ kindLabel, title, color, onClose }: DetailHeaderProps) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-[var(--mc-border)] shrink-0">
      <span
        className="mc-mono text-[9px] tracking-widest px-2 py-0.5 rounded border shrink-0"
        style={{
          color,
          borderColor: `${color}55`,
          background:  `${color}12`,
        }}
      >
        {kindLabel}
      </span>
      <span
        className="mc-mono text-[13px] text-sand leading-tight flex-1 break-words"
        title={title}
      >
        {title}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close detail"
        className="shrink-0 mc-mono text-lg text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] flex items-center justify-center rounded"
        style={{ minHeight: 44, minWidth: 44 }}
      >
        ×
      </button>
    </div>
  )
}

interface DetailBodyProps {
  body:        string | undefined
  createdAt:   string
  sourceRefId: string
  agentLabel:  string
}

function DetailBody({ body, createdAt, sourceRefId, agentLabel }: DetailBodyProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-3 space-y-3">
      <div className="mc-mono text-[11px] leading-relaxed text-sand whitespace-pre-wrap">
        {body && body.trim().length > 0 ? body : '(no detail)'}
      </div>
      <div className="pt-2 border-t border-[var(--mc-border)] space-y-1">
        <div className="flex items-center justify-between">
          <span className="mc-label text-[9px]">OWNER</span>
          <span className="mc-mono text-[10px] text-sand-dim">{agentLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="mc-label text-[9px]">CREATED</span>
          <span className="mc-mono text-[10px] text-sand-dim">{createdAt}</span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="mc-label text-[9px]">REF</span>
          <span className="mc-mono text-[9px] text-sand-dim break-all text-right">{sourceRefId}</span>
        </div>
      </div>
    </div>
  )
}

interface DetailActionsProps {
  accentColor:    string
  showPromote:    boolean
  showViewTask:   boolean
  showInjectDoc:  boolean
  onOpenInChat:   () => void
  onPromoteIdea:  () => void
  onViewTask:     () => void
  onInjectDoc:    () => void
}

function DetailActions({
  accentColor,
  showPromote,
  showViewTask,
  showInjectDoc,
  onOpenInChat,
  onPromoteIdea,
  onViewTask,
  onInjectDoc,
}: DetailActionsProps) {
  return (
    <div className="shrink-0 border-t border-[var(--mc-border)] px-3 py-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onOpenInChat}
        aria-label="Open this node in chat"
        className="mc-mono text-[10px] tracking-widest px-3 border rounded hover:bg-[rgba(0,212,255,0.10)] flex items-center"
        style={{
          minHeight:   44,
          borderColor: 'var(--mc-cyan)',
          color:       'var(--mc-cyan)',
        }}
      >
        OPEN IN CHAT →
      </button>
      {showPromote && (
        <button
          type="button"
          onClick={onPromoteIdea}
          aria-label="Promote this idea to a task"
          className="mc-mono text-[10px] tracking-widest px-3 border rounded hover:brightness-125 flex items-center"
          style={{
            minHeight:   44,
            borderColor: '#efb356',
            color:       '#efb356',
          }}
        >
          PROMOTE TO TASK
        </button>
      )}
      {showViewTask && (
        <button
          type="button"
          onClick={onViewTask}
          aria-label="View this task"
          className="mc-mono text-[10px] tracking-widest px-3 border rounded hover:brightness-125 flex items-center"
          style={{
            minHeight:   44,
            borderColor: accentColor,
            color:       accentColor,
          }}
        >
          VIEW TASK →
        </button>
      )}
      {showInjectDoc && (
        <button
          type="button"
          onClick={onInjectDoc}
          aria-label="Inject this document into chat"
          className="mc-mono text-[10px] tracking-widest px-3 border rounded hover:brightness-125 flex items-center"
          style={{
            minHeight:   44,
            borderColor: '#edf3ff',
            color:       '#edf3ff',
          }}
        >
          INJECT INTO CHAT
        </button>
      )}
    </div>
  )
}
