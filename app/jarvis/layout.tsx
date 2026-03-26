import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jarvis HUD | Jarvis / Axon HUD',
  description: 'Holographic Jarvis command center with Axon-ready operator routing.',
}

export default function JarvisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
