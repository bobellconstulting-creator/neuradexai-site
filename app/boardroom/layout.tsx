import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jarvis / Axon Boardroom',
  description: 'Interactive command boardroom for Jarvis, Axon, and live operator handoff.',
}

export default function BoardroomLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
