import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'J.A.R.V.I.S. Boardroom | Stark AI',
  description: 'Holographic AI Command Center — J.A.R.V.I.S. and team, standing by.',
}

export default function JarvisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
