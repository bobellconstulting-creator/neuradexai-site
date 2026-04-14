'use client'

/**
 * ChatDock — collapsible chat dock pinned to the bottom of the AgentRoom page.
 * Wraps the existing CommunalChat (scoped to office:<agentId>) and adds a
 * minimal DOM-ref bridge so the parent can prefill the draft textarea without
 * modifying CommunalChat's internal state. React still owns the textarea; we
 * just write through React's controlled-input setter and dispatch a synthetic
 * 'input' event so onChange fires.
 *
 * Collapse pattern mirrors QuickBoardroomDock: ~56px slim bar collapsed,
 * min(50vh, 480px) mobile / 300px desktop expanded.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentConfig } from '@/lib/agents'
import { CommunalChat } from '@/components/mission-control/CommunalChat'
import { officeChannel } from '@/lib/missionChannels'

export interface ChatDockProps {
  agent:         AgentConfig
  prefillInput?: string | null
  prefillNonce?: number
}

// Use React's internal value setter so controlled inputs pick up the change.
function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  const setter = descriptor?.set
  if (setter) {
    setter.call(el, value)
  } else {
    el.value = value
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// Detect mobile once at mount — mobile defaults the dock to collapsed so the
// constellation stays the visual centerpiece. Desktop defaults open.
function useDefaultOpenState(): boolean {
  const [defaultOpen, setDefaultOpen] = useState<boolean>(true)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setDefaultOpen(window.innerWidth >= 1024)
  }, [])
  return defaultOpen
}

export function ChatDock({ agent, prefillInput = null, prefillNonce = 0 }: ChatDockProps) {
  const initialOpen = useDefaultOpenState()
  const [open, setOpen] = useState<boolean>(initialOpen)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // When the breakpoint detection resolves post-mount, sync the actual state
  // once. After that the user owns the open/closed toggle.
  const didInitRef = useRef<boolean>(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    setOpen(initialOpen)
  }, [initialOpen])

  // Parent-driven prefill bridge. Finds the first textarea inside the
  // wrapper and writes through React's controlled setter. Retries briefly
  // if the textarea isn't mounted yet (dock was collapsed). Cleans up all
  // pending timers on unmount or nonce change so we never touch a stale DOM.
  useEffect(() => {
    if (!prefillInput || prefillInput.length === 0) return
    setOpen(true)

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    const maxAttempts = 10

    const tryApply = (): void => {
      if (cancelled) return
      const root = containerRef.current
      if (!root) {
        if (++attempt < maxAttempts) timer = setTimeout(tryApply, 40)
        return
      }
      const textarea = root.querySelector('textarea') as HTMLTextAreaElement | null
      if (!textarea) {
        if (++attempt < maxAttempts) timer = setTimeout(tryApply, 40)
        return
      }
      setNativeValue(textarea, prefillInput)
      textarea.focus()
      const len = textarea.value.length
      textarea.setSelectionRange(len, len)
    }
    tryApply()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce])

  const handleToggle = useCallback(() => {
    setOpen((v) => !v)
  }, [])

  // ── COLLAPSED ─────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Open ${agent.displayName}'s office chat`}
        className="
          fixed left-0 right-0 mx-auto
          bottom-[56px]
          lg:left-auto lg:right-4 lg:mx-0 lg:w-[420px] lg:bottom-4
          mc-panel mc-corners
          flex items-center gap-3 px-4
          text-left
          border-2
          transition-colors
        "
        style={{
          height:    56,
          zIndex:    60,
          borderColor: agent.color,
          boxShadow: `0 0 20px ${agent.color}40, inset 0 0 12px ${agent.color}18`,
          minHeight: 56,
        }}
      >
        <span
          aria-hidden="true"
          className="mc-mono text-base shrink-0"
          style={{ color: agent.color }}
        >
          {agent.icon}
        </span>
        <span
          className="mc-mono text-[12px] tracking-widest font-bold shrink-0"
          style={{ color: agent.color }}
        >
          ▸ TAP TO CHAT · {agent.label}
        </span>
        <span
          className="mc-mono text-[11px] ml-auto shrink-0 font-bold"
          style={{ color: agent.color }}
        >
          ↑
        </span>
      </button>
    )
  }

  // ── EXPANDED ──────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="
        fixed left-0 right-0
        bottom-[56px]
        lg:left-auto lg:right-4 lg:w-[420px] lg:bottom-4
        mc-panel mc-corners
        flex flex-col
        border-2
      "
      style={{
        zIndex:      60,
        height:      'min(50vh, 480px)',
        borderColor: agent.color,
        boxShadow:   `0 0 24px ${agent.color}33`,
      }}
    >
      {/* Collapse handle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--mc-border)] shrink-0">
        <span className="mc-mono text-[9px] tracking-widest" style={{ color: agent.color }}>
          {agent.label} · OFFICE
        </span>
        <button
          type="button"
          onClick={handleToggle}
          aria-label="Collapse chat dock"
          className="ml-auto mc-mono text-[10px] tracking-widest text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] flex items-center justify-center"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          ▼
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <CommunalChat
          channel={officeChannel(agent.id)}
          title={`${agent.label} · PRIVATE`}
          placeholder={`Message ${agent.displayName} privately. Nothing leaves this office unless you SHARE it.`}
          allowShare={true}
        />
      </div>
    </div>
  )
}
