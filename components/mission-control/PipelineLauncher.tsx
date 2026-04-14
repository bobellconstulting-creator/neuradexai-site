'use client'

/**
 * PipelineLauncher — Modal that Bo opens from the boardroom to kick off a
 * new multi-step agent pipeline. Supports 4 preset templates (BUILD, LAUNCH,
 * QA, RESEARCH) plus a CUSTOM sequence picker for reordering / toggling
 * specific agents.
 *
 * State flow:
 *   1. Bo types a title (or uses the prefilled one)
 *   2. Bo picks a template OR toggles CUSTOM and builds a sequence
 *   3. Click LAUNCH → calls useMissionPipelines().create(...)
 *   4. Success → 3s toast + close modal
 *   5. Error   → red error line under the launch button
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AGENTS, getAgent } from '@/lib/agents'
import { useMissionPipelines } from '@/lib/useMissionPipelines'

type TemplateId = 'BUILD' | 'LAUNCH' | 'QA' | 'RESEARCH' | 'CUSTOM'

interface TemplateDef {
  id:          TemplateId
  label:       string
  blurb:       string
  sequence:    string[]
}

const TEMPLATES: readonly TemplateDef[] = [
  {
    id:       'BUILD',
    label:    'BUILD',
    blurb:    'Plan · Build · Verify',
    sequence: ['doc', 'marcus', 'linda'],
  },
  {
    id:       'LAUNCH',
    label:    'LAUNCH',
    blurb:    'Plan · Build · Verify · Ship',
    sequence: ['doc', 'marcus', 'linda', 'vault'],
  },
  {
    id:       'QA',
    label:    'QA',
    blurb:    'Verify · Report',
    sequence: ['linda', 'doc'],
  },
  {
    id:       'RESEARCH',
    label:    'RESEARCH',
    blurb:    'Research · Synthesize',
    sequence: ['linda', 'doc'],
  },
] as const

interface PipelineLauncherProps {
  open:          boolean
  onClose:       () => void
  defaultTitle?: string
}

export function PipelineLauncher({
  open,
  onClose,
  defaultTitle = '',
}: PipelineLauncherProps): JSX.Element | null {
  const { create } = useMissionPipelines()

  const [title, setTitle]                 = useState<string>(defaultTitle)
  const [templateId, setTemplateId]       = useState<TemplateId>('BUILD')
  const [customOpen, setCustomOpen]       = useState<boolean>(false)
  const [customSteps, setCustomSteps]     = useState<string[]>(['doc', 'marcus', 'linda'])
  const [submitting, setSubmitting]       = useState<boolean>(false)
  const [errorMessage, setErrorMessage]   = useState<string | null>(null)
  const [toastVisible, setToastVisible]   = useState<boolean>(false)

  // Reset internal state when the modal opens. We deliberately do NOT reset
  // on close so any in-flight submit message stays legible until re-open.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
      setTemplateId('BUILD')
      setCustomOpen(false)
      setCustomSteps(['doc', 'marcus', 'linda'])
      setErrorMessage(null)
      setSubmitting(false)
    }
  }, [open, defaultTitle])

  // Resolve the sequence the user is about to launch. CUSTOM mode wins;
  // otherwise use the selected template.
  const resolvedSteps = useMemo<string[]>(() => {
    if (customOpen) return customSteps
    const tpl = TEMPLATES.find((t) => t.id === templateId)
    return tpl ? [...tpl.sequence] : []
  }, [customOpen, customSteps, templateId])

  const resolvedTemplateLabel = useMemo<string>(
    () => (customOpen ? 'CUSTOM' : templateId),
    [customOpen, templateId],
  )

  const canLaunch = title.trim().length > 0 && resolvedSteps.length > 0 && !submitting

  const handleLaunch = useCallback(async (): Promise<void> => {
    if (!canLaunch) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await create({
        title:    title.trim(),
        steps:    resolvedSteps,
        template: resolvedTemplateLabel,
      })
      setToastVisible(true)
      onClose()
      // Hide the toast after 3s. The toast is rendered at the modal level
      // but persists after onClose() because it's a separate portal fragment.
      window.setTimeout(() => setToastVisible(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch pipeline'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }, [canLaunch, create, title, resolvedSteps, resolvedTemplateLabel, onClose])

  const toggleCustomAgent = useCallback((agentId: string): void => {
    setCustomSteps((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    )
  }, [])

  const moveCustomStep = useCallback((index: number, direction: -1 | 1): void => {
    setCustomSteps((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      const a = next[index]
      const b = next[target]
      if (a === undefined || b === undefined) return prev
      next[index]  = b
      next[target] = a
      return next
    })
  }, [])

  // Early return AFTER hooks so hook count stays stable across renders.
  if (!open && !toastVisible) return null

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pipeline launcher"
          onClick={onClose}
        >
          <div
            className="mc-panel mc-corners p-5 w-[min(92vw,520px)] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
              <span className="mc-mono text-sm tracking-widest text-[var(--mc-cyan)]">
                PIPELINE LAUNCHER
              </span>
              <button
                type="button"
                aria-label="Close pipeline launcher"
                onClick={onClose}
                className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] transition-colors"
              >
                <span className="mc-mono text-lg">×</span>
              </button>
            </div>

            {/* ── Title field ─────────────────────────────────────── */}
            <label className="block mb-3">
              <span className="mc-label mc-label-brass text-[10px] mb-1 block">MISSION</span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you want the fleet to do?"
                aria-label="Pipeline mission title"
                className="w-full min-h-[60px] bg-[rgba(5,7,20,0.7)] border border-[var(--mc-border)] text-[var(--mc-cyan)] placeholder:text-[rgba(180,190,210,0.45)] px-3 py-2 rounded-sm mc-mono text-xs focus:outline-none focus:border-[var(--mc-cyan)] resize-y"
              />
            </label>

            {/* ── Template grid ────────────────────────────────────── */}
            <div className="mb-3">
              <span className="mc-label mc-label-brass text-[10px] mb-2 block">TEMPLATE</span>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((tpl) => {
                  const selected = !customOpen && tpl.id === templateId
                  return (
                    <TemplateCard
                      key={tpl.id}
                      template={tpl}
                      selected={selected}
                      onSelect={() => {
                        setCustomOpen(false)
                        setTemplateId(tpl.id)
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* ── Custom toggle + sequence picker ─────────────────── */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                aria-expanded={customOpen}
                aria-label="Toggle custom sequence builder"
                className="w-full min-h-[44px] px-3 py-2 mc-mono text-[11px] tracking-[0.18em] text-left border border-[var(--mc-border-warm)] hover:border-[#efb356] text-[#efb356] rounded-sm flex items-center justify-between"
              >
                <span>{customOpen ? '▾' : '▸'} CUSTOM SEQUENCE</span>
                <span className="mc-label text-[10px]">
                  {customOpen ? `${customSteps.length} steps` : 'tap to build'}
                </span>
              </button>

              {customOpen && (
                <div className="mt-2 space-y-2">
                  {/* Agent toggle row */}
                  <div className="flex flex-wrap gap-2">
                    {AGENTS.map((a) => {
                      const on = customSteps.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-label={`${on ? 'Remove' : 'Add'} ${a.label} to custom sequence`}
                          aria-pressed={on}
                          onClick={() => toggleCustomAgent(a.id)}
                          className="min-h-[44px] px-3 py-1 mc-mono text-[10px] tracking-[0.15em] rounded-sm border transition-colors"
                          style={{
                            borderColor: on ? a.color : `${a.color}40`,
                            color:       on ? a.color : 'rgba(180,190,210,0.6)',
                            background:  on ? `${a.color}15` : 'transparent',
                          }}
                        >
                          {on ? '✓ ' : '+ '}
                          {a.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Ordered sequence list with up/down controls */}
                  {customSteps.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {customSteps.map((agentId, i) => {
                        const a = getAgent(agentId)
                        const color = a?.color ?? '#94a3b8'
                        return (
                          <li
                            key={`${agentId}-${i}`}
                            className="flex items-center gap-2 px-2 py-1 rounded-sm border"
                            style={{
                              borderColor: `${color}40`,
                              background:  `${color}08`,
                            }}
                          >
                            <span
                              className="mc-mono text-[10px] font-bold w-5 text-right"
                              style={{ color }}
                            >
                              {i + 1}.
                            </span>
                            <span
                              className="mc-mono text-[11px] font-bold flex-1"
                              style={{ color }}
                            >
                              {a?.label ?? agentId.toUpperCase()}
                            </span>
                            <button
                              type="button"
                              aria-label={`Move ${a?.label ?? agentId} up`}
                              disabled={i === 0}
                              onClick={() => moveCustomStep(i, -1)}
                              className="min-h-[44px] min-w-[44px] mc-mono text-xs text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${a?.label ?? agentId} down`}
                              disabled={i === customSteps.length - 1}
                              onClick={() => moveCustomStep(i, 1)}
                              className="min-h-[44px] min-w-[44px] mc-mono text-xs text-[var(--mc-text-mute)] hover:text-[var(--mc-cyan)] disabled:opacity-30"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${a?.label ?? agentId} from sequence`}
                              onClick={() => toggleCustomAgent(agentId)}
                              className="min-h-[44px] min-w-[44px] mc-mono text-sm text-[rgba(255,96,96,0.7)] hover:text-[#ff6060]"
                            >
                              ×
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="mc-label text-[10px] text-center py-2">
                      No agents selected — tap an agent above to add it
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Launch button ───────────────────────────────────── */}
            <button
              type="button"
              onClick={handleLaunch}
              disabled={!canLaunch}
              aria-label="Launch pipeline"
              className="w-full h-14 min-h-[56px] mc-mono text-sm tracking-[0.22em] font-bold text-[var(--mc-cyan)] border border-[var(--mc-cyan)] rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background:
                  'linear-gradient(180deg, rgba(0,212,255,0.18) 0%, rgba(0,212,255,0.04) 100%), rgba(5,7,20,0.92)',
                boxShadow: canLaunch
                  ? '0 0 0 1px rgba(0,212,255,0.35), 0 0 22px rgba(0,212,255,0.45)'
                  : 'none',
                textShadow: '0 0 8px rgba(0,212,255,0.6)',
              }}
            >
              {submitting ? 'LAUNCHING…' : 'LAUNCH PIPELINE →'}
            </button>

            {errorMessage && (
              <div
                className="mt-2 mc-mono text-[11px] text-[#ff9e9e] border border-[rgba(255,96,96,0.35)] bg-[rgba(255,96,96,0.08)] px-3 py-2 rounded-sm"
                role="alert"
              >
                {errorMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Success toast ─────────────────────────────────────────── */}
      {toastVisible && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[90] mc-panel mc-corners px-4 py-3 mc-mono text-[11px] tracking-[0.2em] text-[#22c55e]"
          role="status"
        >
          ✓ PIPELINE LAUNCHED
        </div>
      )}
    </>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: TemplateDef
  selected: boolean
  onSelect: () => void
}

function TemplateCard({ template, selected, onSelect }: TemplateCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Select ${template.label} template`}
      aria-pressed={selected}
      className="relative flex flex-col justify-between text-left p-3 rounded-sm transition-all min-h-[96px]"
      style={{
        border: selected
          ? '1.5px solid var(--mc-cyan)'
          : '1px solid var(--mc-border-warm)',
        background: selected
          ? 'linear-gradient(180deg, rgba(0,212,255,0.14) 0%, rgba(0,212,255,0.02) 100%), rgba(5,7,20,0.8)'
          : 'rgba(5,7,20,0.55)',
        boxShadow: selected
          ? '0 0 0 1px rgba(0,212,255,0.4), 0 0 14px rgba(0,212,255,0.28)'
          : 'none',
      }}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-2 mc-mono text-xs font-bold text-[var(--mc-cyan)]"
        >
          ✓
        </span>
      )}
      <div>
        <div className="mc-mono text-xs tracking-[0.22em] font-bold text-[#efb356]">
          {template.label}
        </div>
        <div className="mc-label text-[9px] mt-0.5">{template.blurb}</div>
      </div>
      <div className="flex items-center gap-1 mt-2" aria-hidden="true">
        {template.sequence.map((agentId, idx) => {
          const a = getAgent(agentId)
          const color = a?.color ?? '#94a3b8'
          return (
            <span key={`${agentId}-${idx}`} className="flex items-center gap-1">
              <span
                style={{
                  width:        10,
                  height:       10,
                  borderRadius: '50%',
                  background:   color,
                  boxShadow:    `0 0 6px ${color}`,
                  display:      'inline-block',
                }}
              />
              {idx < template.sequence.length - 1 && (
                <span className="mc-mono text-[10px] text-[rgba(180,190,210,0.5)]">→</span>
              )}
            </span>
          )
        })}
      </div>
    </button>
  )
}

export default PipelineLauncher
