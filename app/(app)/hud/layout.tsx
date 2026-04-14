import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'HUD — Neuradex AI',
  description: 'Holographic fleet display. 3D JARVIS-style command view for the Neuradex AI agent network.',
}

export default function HudLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        background: '#02060c',
      }}
    >
      {children}
    </div>
  )
}
