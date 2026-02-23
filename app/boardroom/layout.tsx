import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Boardroom v1.0 | Neuradex AI',
  description: 'Interactive AI Boardroom — Command your agent fleet.',
}

export default function BoardroomLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
