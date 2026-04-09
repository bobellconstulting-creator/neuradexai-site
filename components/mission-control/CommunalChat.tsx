'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTS, getAgent } from '@/lib/agents'
import { useMissionStream } from '@/lib/useMissionStream'
import { BOARDROOM, officeChannel, type ChannelId, type MissionMessage } from '@/lib/missionChannels'

interface CommunalChatProps {
  agentId?: string           // legacy — filter to one agent (fallback)
  channel?: ChannelId        // NEW: explicit channel (e.g. "office:bob")
  title?:   string
  placeholder?: string
  /** Show the SHARE button so messages can be promoted out of this channel */
  allowShare?: boolean
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function authorOf(msg: MissionMessage): { label: string; color: string } {
  if (msg.agentId === 'bo') return { label: 'BO', color: '#edf3ff' }
  const agent = getAgent(msg.agentId)
  if (agent) return { label: agent.label, color: agent.color }
  return { label: msg.agentId.toUpperCase(), color: '#8aa0b8' }
}

export function CommunalChat({
  agentId,
  channel,
  title = 'COMMS CHANNEL',
  placeholder,
  allowShare = false,
}: CommunalChatProps) {
  const { messages, loading, error, send, sending, share } = useMissionStream({ agentId, channel })
  const [draft, setDraft] = useState('')
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [shareOpen, setShareOpen] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Detect @ in draft for autocomplete
  useEffect(() => {
    const match = draft.match(/@([a-z0-9_-]*)$/i)
    if (match) {
      setShowMention(true)
      setMentionQuery(match[1].toLowerCase())
    } else {
      setShowMention(false)
    }
  }, [draft])

  const mentionCandidates = useMemo(
    () =>
      AGENTS.filter((a) => a.id.startsWith(mentionQuery) || a.label.toLowerCase().startsWith(mentionQuery)).slice(
        0,
        5,
      ),
    [mentionQuery],
  )

  const applyMention = (id: string) => {
    setDraft((d) => d.replace(/@([a-z0-9_-]*)$/i, `@${id} `))
    setShowMention(false)
  }

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    await send(content)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const effectivePlaceholder =
    placeholder ??
    (agentId
      ? `Message ${getAgent(agentId)?.label ?? agentId.toUpperCase()}…`
      : 'Broadcast to the fleet.  @jarvis, @linda, @marcus, @atlas, @claude…')

  return (
    <div className="mc-panel mc-corners flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--mc-border)]">
        <span className="mc-label mc-label-brass">{title}</span>
        <div className="flex items-center gap-3">
          {loading && <span className="mc-label text-[var(--mc-text-mute)]">SYNC</span>}
          {error && <span className="mc-label text-[#ff6060]">LINK {error.toUpperCase()}</span>}
          <span className="mc-label">{messages.length.toString().padStart(3, '0')} MSG</span>
        </div>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-2 space-y-2">
        {messages.length === 0 && !loading && (
          <div className="mc-label py-10 text-center text-[var(--mc-text-mute)]">
            CHANNEL QUIET — TYPE A MESSAGE AND @MENTION AN AGENT
          </div>
        )}
        {messages.map((m) => {
          const author = authorOf(m)
          const isPending = m.status === 'pending'
          const isUser = m.agentId === 'bo'
          const isShared = !!m.sharedFrom
          return (
            <div
              key={m.id}
              className={`mc-slide-in relative flex items-start gap-3 px-2 py-1.5 rounded border group ${
                isUser
                  ? 'border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.04)]'
                  : isShared
                  ? 'border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.03)]'
                  : 'border-transparent hover:border-[var(--mc-border)]'
              }`}
            >
              {isShared && m.sharedFrom && (
                <div className="absolute -top-2 right-3 mc-mono text-[8px] tracking-widest text-[#f59e0b] bg-[#1e2122] px-1.5">
                  ↑ SHARED FROM {m.sharedFrom.channel.toUpperCase()}
                </div>
              )}
              {allowShare && !isPending && m.content && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShareOpen((prev) => (prev === m.id ? null : m.id))
                  }}
                  className="absolute top-1 right-2 opacity-0 group-hover:opacity-100 mc-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded border border-[var(--mc-border)] text-[var(--mc-text-mute)] hover:text-[#f59e0b] hover:border-[#f59e0b] transition-all"
                >
                  SHARE
                </button>
              )}
              {shareOpen === m.id && (
                <div className="absolute top-7 right-2 z-30 mc-panel mc-corners p-2 min-w-[200px]">
                  <div className="mc-label text-[9px] mb-1">SHARE TO</div>
                  <button
                    onClick={async () => {
                      await share(m.id, [BOARDROOM])
                      setShareOpen(null)
                    }}
                    className="w-full text-left px-2 py-1 mc-mono text-[10px] hover:bg-[rgba(245,158,11,0.10)] text-[#f59e0b]"
                  >
                    → BOARDROOM (all agents)
                  </button>
                  {AGENTS.filter((a) => a.id !== m.agentId).slice(0, 5).map((a) => (
                    <button
                      key={a.id}
                      onClick={async () => {
                        await share(m.id, [officeChannel(a.id)])
                        setShareOpen(null)
                      }}
                      className="w-full text-left px-2 py-1 mc-mono text-[10px] hover:bg-[rgba(0,212,255,0.10)]"
                      style={{ color: a.color }}
                    >
                      → @{a.label}&apos;s OFFICE
                    </button>
                  ))}
                  <button
                    onClick={() => setShareOpen(null)}
                    className="w-full text-left px-2 py-1 mc-mono text-[9px] text-[var(--mc-text-mute)] border-t border-[var(--mc-border)] mt-1 pt-1"
                  >
                    cancel
                  </button>
                </div>
              )}
              <div className="shrink-0 flex flex-col items-center w-16">
                <span
                  className="mc-mono text-[10px] tracking-[0.22em] font-semibold"
                  style={{ color: author.color }}
                >
                  {author.label}
                </span>
                <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] mt-0.5">
                  {formatTime(m.ts)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {isPending ? (
                  <span className="mc-mono text-[11px] text-[var(--mc-text-mute)] italic">
                    awaiting response…
                  </span>
                ) : (
                  <p className="text-[12px] text-sand mc-mono whitespace-pre-wrap break-words leading-relaxed">
                    {m.content}
                  </p>
                )}
                {m.mentions.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {m.mentions.map((id) => {
                      const a = getAgent(id)
                      return (
                        <span
                          key={id}
                          className="mc-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded border"
                          style={{
                            color: a?.color ?? '#8aa0b8',
                            borderColor: a?.accent ?? 'rgba(255,255,255,0.1)',
                          }}
                        >
                          @{id.toUpperCase()}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="relative border-t border-[var(--mc-border)] p-2">
        {showMention && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-2 mb-1 mc-panel mc-corners py-1 min-w-[180px] z-20">
            {mentionCandidates.map((a) => (
              <button
                key={a.id}
                onClick={() => applyMention(a.id)}
                className="w-full text-left px-3 py-1.5 mc-mono text-[11px] flex items-center gap-2 hover:bg-[rgba(0,212,255,0.08)]"
              >
                <span className="text-sm" style={{ color: a.color }}>
                  {a.icon}
                </span>
                <span style={{ color: a.color }}>{a.label}</span>
                <span className="text-[var(--mc-text-mute)] ml-auto text-[10px]">{a.role}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={effectivePlaceholder}
            rows={2}
            className="flex-1 resize-none bg-[rgba(5,7,20,0.55)] border border-[var(--mc-border)] rounded px-3 py-2 mc-mono text-[12px] text-sand placeholder:text-[var(--mc-text-mute)] focus:outline-none focus:border-[var(--mc-cyan)]"
          />
          <button
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            className="mc-mono text-[11px] tracking-widest px-4 py-2 border border-[var(--mc-cyan)] text-[var(--mc-cyan)] rounded hover:bg-[rgba(0,212,255,0.10)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? 'SEND…' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  )
}
