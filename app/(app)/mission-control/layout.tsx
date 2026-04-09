import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mission Control — Neuradex AI',
  description: 'Cinematic war-room HUD for the Neuradex AI agent fleet.',
}

export default function MissionControlLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="mc-root-shell">{children}</div>
}
