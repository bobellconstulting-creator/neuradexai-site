import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jarvis',
  description: 'Holographic Jarvis command center with Axon-ready operator routing.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Jarvis',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export default function JarvisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
