'use client'

/**
 * OrbErrorBoundary — isolates runtime crashes in the AmbientOrb / AgentOrbScene
 * R3F tree so a WebGL or audio-reactive failure can never take down the whole
 * lobby page. If the child throws, we render a minimal static fallback in the
 * same footprint so the layout does not shift.
 *
 * Intentionally a classic class component — React's Error Boundary API still
 * requires classes. Kept local to mission-control so it does not leak into
 * unrelated trees.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface OrbErrorBoundaryProps {
  children: ReactNode
  label?:   string
}

interface OrbErrorBoundaryState {
  hasError: boolean
  message:  string
}

export class OrbErrorBoundary extends Component<OrbErrorBoundaryProps, OrbErrorBoundaryState> {
  constructor(props: OrbErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(err: unknown): OrbErrorBoundaryState {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message: message.slice(0, 200) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[OrbErrorBoundary] caught:', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="status"
          aria-label={`${this.props.label ?? 'Orb'} fallback`}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 16,
            background: '#020308',
            color: 'rgba(0, 212, 255, 0.85)',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.18em',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {(this.props.label ?? 'ORB').toUpperCase()} · OFFLINE
          </span>
          <span style={{ color: 'rgba(239, 179, 86, 0.75)', fontSize: 9 }}>
            {this.state.message || 'render failed'}
          </span>
        </div>
      )
    }
    return this.props.children
  }
}

export default OrbErrorBoundary
