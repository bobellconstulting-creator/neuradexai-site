'use client'

/**
 * QuickBoardroomDock
 * ------------------
 * Persistent chat dock that lives on the mission-control lobby page so Bo
 * can talk to the fleet without leaving the lobby. Collapses to a slim bar
 * above the BottomBar; expands to a ~50vh (mobile) / 300px (desktop) panel.
 *
 * - Polls /api/mission/stream?channel=boardroom every 2s ONLY while expanded
 * - Sends via POST /api/mission/broadcast (no channel override — route auto-
 *   decides based on @mentions)
 * - Mobile: swipe-down-to-collapse via native touch events
 * - Desktop (lg+): docks to the bottom-right quadrant as a 400px-wide panel
 * - Mobile: full-width bottom sheet
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type TouchEvent,
} from 'react'
import { getAgent } from '@/lib/agents'
import { useDeviceLabel } from '@/lib/useDeviceLabel'
import type { MissionMessage } from '@/lib/missionChannels'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QuickBoardroomDockProps {
  initiallyOpen?: boolean
  /** Called when user taps the paperclip icon — parent wires to upload flow. */
  onInjectFileRequest?: () => void
  /**
   * Pre-fills the input field whenever this value changes (non-null).
   * Used by the lobby to inject "look at this: <path>" after a file drop.
   * Also forces the dock open so Bo can see the prefilled text.
   */
  prefillInput?: string | null
  /**
   * Monotonic nonce bumped by the parent every time it wants the dock to
   * re-apply `prefillInput` — even if the string value is identical to a
   * previous prefill (e.g. Bo injects the same file twice in a row).
   */
  prefillNonce?: number
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface StreamResponse {
  ok:       boolean
  messages: MissionMessage[]
}

interface BroadcastResponse {
  ok:      boolean
  error?:  string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000
const BOARDROOM_CHANNEL = 'boardroom'
const SWIPE_COLLAPSE_THRESHOLD_PX = 60
const MAX_RENDERED_MESSAGES = 80

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

function authorOf(msg: MissionMessage): { label: string; color: string } {
  if (msg.agentId === 'bo') return { label: 'BO', color: '#edf3ff' }
  const agent = getAgent(msg.agentId)
  if (agent) return { label: agent.label, color: agent.color }
  return { label: msg.agentId.toUpperCase(), color: '#8aa0b8' }
}

function previewOf(msg: MissionMessage | undefined): string {
  if (!msg) return 'No messages yet. Tag @doc / @linda / @marcus / @vault'
  const author = authorOf(msg)
  const body = msg.content.replace(/\s+/g, ' ').trim()
  const shortBody = body.length > 60 ? `${body.slice(0, 60)}...` : body
  return `${author.label}: ${shortBody}`
}

// ─── Component ────────────────────────────────────────────────────────────────

// Mobile vs desktop open default — mirrors the ChatDock pattern. On mobile the
// dock MUST default collapsed so it does not physically cover the lobby's
// office tile grid or the ENTER BOARDROOM button. Desktop defaults open.
function computeDefaultOpen(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit
  if (typeof window === 'undefined') return false
  return window.innerWidth >= 1024
}

export function QuickBoardroomDock({
  initiallyOpen,
  onInjectFileRequest,
  prefillInput = null,
  prefillNonce = 0,
}: QuickBoardroomDockProps) {
  const [open, setOpen] = useState<boolean>(() => computeDefaultOpen(initiallyOpen))
  const [messages, setMessages] = useState<MissionMessage[]>([])
  const [input, setInput] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [waitingForReply, setWaitingForReply] = useState<boolean>(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef  = useRef<HTMLInputElement | null>(null)
  const touchStartY = useRef<number | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef<boolean>(true)

  // Per-device label — prepended to outgoing content so Bo can see in the
  // stream history which machine a message was sent from (SURFACE vs DESKTOP).
  const { label: deviceLabel } = useDeviceLabel()

  // ── Fetch loop ───────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/mission/stream?channel=${encodeURIComponent(BOARDROOM_CHANNEL)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) throw new Error(`stream ${res.status}`)
      const data = (await res.json()) as StreamResponse
      if (!mountedRef.current) return
      const next = data.messages ?? []
      setMessages(next)
      setError(null)

      // Clear the typing pulse as soon as ANY non-bo message with real
      // content has landed after Bo's last message. Pending stubs and empty
      // SILENCE resolutions don't count — we want the dot to drop only when
      // Bo has something actual to read.
      if (next.length > 0) {
        let lastBoIdx = -1
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].agentId === 'bo') {
            lastBoIdx = i
            break
          }
        }
        for (let i = lastBoIdx + 1; i < next.length; i += 1) {
          const m = next[i]
          if (m.agentId === 'bo') continue
          if (m.status === 'pending') continue
          if (m.content.trim().length === 0) continue
          setWaitingForReply(false)
          break
        }
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'stream error')
    }
  }, [])

  // Start polling only while expanded. Stop on collapse/unmount.
  useEffect(() => {
    mountedRef.current = true
    if (!open) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      return
    }
    // Kick off an immediate fetch, then poll.
    fetchMessages()
    pollTimer.current = setInterval(fetchMessages, POLL_INTERVAL_MS)
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [open, fetchMessages])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [])

  // When messages grow, auto-scroll the list to the bottom.
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, open, waitingForReply])

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      // slight delay so layout settles before focus
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Parent-driven prefill: when a file is dropped in the lobby, the page
  // bumps `prefillNonce` and passes the content as `prefillInput`. Mirror
  // it into local state and force the dock open so Bo sees what will be sent.
  useEffect(() => {
    if (prefillInput && prefillInput.length > 0) {
      setInput(prefillInput)
      setOpen(true)
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
    // prefillInput intentionally excluded from deps so the nonce drives re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce])

  // ── Sending ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed || sending) return
      // Prepend device label so Bo can tell later which machine he was on
      // when he sent the message. Simple string concat — no server schema change.
      const labelPrefix = deviceLabel && deviceLabel.length > 0 ? `[${deviceLabel}] ` : ''
      const content = `${labelPrefix}${trimmed}`
      setSending(true)
      setError(null)
      try {
        // Force channel=boardroom so Bo's dock always sees replies, even if
        // the message has a single @mention that would normally route to a
        // private office channel. Private 1:1 is still available via the
        // agent office page.
        const res = await fetch('/api/mission/broadcast', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content, channel: 'boardroom' }),
        })
        if (!res.ok) throw new Error(`broadcast ${res.status}`)
        const data = (await res.json()) as BroadcastResponse
        if (!data.ok) throw new Error(data.error ?? 'broadcast failed')
        setInput('')
        setWaitingForReply(true)
        // Immediate fetch so Bo sees his own message land, then poll covers replies.
        await fetchMessages()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'send failed')
      } finally {
        if (mountedRef.current) setSending(false)
      }
    },
    [sending, fetchMessages, deviceLabel],
  )

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      void handleSend(input)
    },
    [handleSend, input],
  )

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend(input)
      }
    },
    [handleSend, input],
  )

  // ── Swipe-down-to-collapse (mobile) ──────────────────────────────────────
  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]
    if (t) touchStartY.current = t.clientY
  }, [])

  const onTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) return
    const t = e.touches[0]
    if (!t) return
    const dy = t.clientY - touchStartY.current
    if (dy > SWIPE_COLLAPSE_THRESHOLD_PX) {
      setOpen(false)
      touchStartY.current = null
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    touchStartY.current = null
  }, [])

  // ── Derived ──────────────────────────────────────────────────────────────
  const visibleMessages = useMemo(() => {
    // Drop agent rows that resolved with no content (Doc's "SILENCE" opt-out
    // becomes content:'' status:'done'). Empty rows look like the chat is
    // broken — hide them. Bo's own messages always show.
    const filtered = messages.filter((m) => {
      if (m.agentId === 'bo' || m.role === 'user') return true
      if (m.status === 'pending') return true
      return m.content.trim().length > 0
    })
    if (filtered.length <= MAX_RENDERED_MESSAGES) return filtered
    return filtered.slice(filtered.length - MAX_RENDERED_MESSAGES)
  }, [messages])

  const lastMessage = useMemo(
    () => (messages.length > 0 ? messages[messages.length - 1] : undefined),
    [messages],
  )

  // ── Render ───────────────────────────────────────────────────────────────

  // COLLAPSED — slim bar docked to bottom above BottomBar.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          fixed left-0 right-0 mx-auto
          bottom-[56px] lg:bottom-[72px]
          lg:left-auto lg:right-4 lg:mx-0 lg:w-[400px]
          h-[72px] px-4
          mc-panel mc-corners
          flex items-center gap-3
          text-left
          border-2 border-[var(--mc-cyan)]
          hover:border-[var(--mc-cyan)]
          transition-colors
          animate-pulse
        "
        style={{
          zIndex: 60,
          boxShadow: '0 0 24px rgba(0,212,255,0.35), inset 0 0 12px rgba(0,212,255,0.12)',
        }}
        aria-label="Open quick boardroom chat"
      >
        <span
          className="mc-mono text-[14px] tracking-[0.22em] font-bold shrink-0"
          style={{ color: 'var(--mc-cyan)' }}
        >
          ▸ TAP TO CHAT
        </span>
        <span className="mc-label text-[10px] truncate flex-1 hidden sm:block">
          {previewOf(lastMessage)}
        </span>
        <span
          className="mc-mono text-[12px] shrink-0 font-bold"
          style={{ color: 'var(--mc-cyan)' }}
        >
          ↑
        </span>
      </button>
    )
  }

  // EXPANDED — bottom sheet on mobile, corner panel on desktop.
  return (
    <div
      className="
        fixed left-0 right-0
        bottom-[56px] lg:bottom-[72px]
        lg:left-auto lg:right-4 lg:w-[400px]
        mc-panel mc-corners
        flex flex-col
        border border-[var(--mc-cyan)]
      "
      style={{
        zIndex: 60,
        height: 'min(50vh, 520px)',
      }}
      role="dialog"
      aria-label="Quick boardroom chat"
    >
      {/* Header / drag handle — swipe handlers live HERE only, not on the
          whole dock, so scrolling the message list never triggers collapse. */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b border-[var(--mc-border)] shrink-0 cursor-grab"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="lg:hidden w-10 h-1 rounded-full bg-[var(--mc-border)]"
          aria-hidden="true"
        />
        <span
          className="mc-mono text-[11px] tracking-[0.22em] font-bold"
          style={{ color: 'var(--mc-cyan)' }}
        >
          &gt; TALK TO FLEET
        </span>
        <span className="mc-label mc-label-brass text-[9px] ml-1">BOARDROOM</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto mc-mono text-[11px] px-2 py-0.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] border border-transparent hover:border-[var(--mc-cyan)] rounded"
          aria-label="Collapse chat"
        >
          ✕
        </button>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto mc-scroll px-3 py-2 flex flex-col gap-1.5"
      >
        {visibleMessages.length === 0 && !waitingForReply ? (
          <div className="mc-label text-[10px] text-center py-6">
            No messages yet. Tag an agent with @doc, @linda, @marcus, or @vault.
          </div>
        ) : (
          visibleMessages.map((m) => {
            const author = authorOf(m)
            const isPending = m.status === 'pending'
            return (
              <div key={m.id} className="flex items-start gap-2 text-[12px] leading-snug">
                <span
                  className="mc-mono text-[9px] font-bold tracking-wider shrink-0 w-14"
                  style={{ color: author.color }}
                >
                  {author.label}
                </span>
                <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] shrink-0">
                  {formatTime(m.ts)}
                </span>
                <span className="flex-1 whitespace-pre-wrap break-words text-[var(--mc-text)]">
                  {isPending ? (
                    <span className="italic text-[var(--mc-text-mute)]">awaiting reply…</span>
                  ) : (
                    m.content
                  )}
                </span>
              </div>
            )
          })
        )}

        {waitingForReply ? <TypingPulse /> : null}
      </div>

      {/* Error strip */}
      {error ? (
        <div
          className="mc-mono text-[9px] px-3 py-1 border-t border-[rgba(255,96,96,0.30)] text-[#ff6060] shrink-0"
          role="alert"
        >
          ERR: {error}
        </div>
      ) : null}

      {/* Input */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 px-2 py-2 border-t border-[var(--mc-border)] shrink-0"
      >
        {onInjectFileRequest ? (
          <button
            type="button"
            onClick={onInjectFileRequest}
            className="mc-mono text-[14px] px-2 py-1 text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] border border-transparent hover:border-[var(--mc-cyan)] rounded shrink-0"
            aria-label="Attach file"
            title="Attach a file from the dropzone"
          >
            ⌇
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="@marcus build me... @doc what's the status..."
          disabled={sending}
          className="
            flex-1 min-w-0 bg-transparent outline-none
            mc-mono text-[12px] text-[var(--mc-text)]
            placeholder:text-[var(--mc-text-mute)]
            px-2 py-1.5 min-h-[44px]
            border border-[var(--mc-border)] focus:border-[var(--mc-cyan)]
            rounded
          "
          aria-label="Message the fleet"
        />
        <button
          type="submit"
          disabled={sending || input.trim().length === 0}
          className="
            mc-mono text-[12px] tracking-[0.2em] font-bold
            px-3 py-1.5 min-h-[44px] min-w-[44px] rounded shrink-0
            border border-[var(--mc-cyan)]
            text-[var(--mc-cyan)]
            hover:bg-[rgba(0,212,255,0.10)]
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          aria-label="Send message"
        >
          {sending ? '…' : 'SEND'}
        </button>
      </form>
    </div>
  )
}

// ─── Typing pulse indicator ──────────────────────────────────────────────────

function TypingPulse() {
  return (
    <div className="flex items-center gap-2 text-[12px] py-1">
      <span
        className="mc-mono text-[9px] font-bold tracking-wider w-14"
        style={{ color: 'var(--mc-text-mute)' }}
      >
        FLEET
      </span>
      <span className="mc-mono text-[9px] text-[var(--mc-text-mute)] shrink-0">
        ·····
      </span>
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--mc-cyan)] animate-pulse" />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--mc-cyan)] animate-pulse"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--mc-cyan)] animate-pulse"
          style={{ animationDelay: '300ms' }}
        />
      </span>
    </div>
  )
}
