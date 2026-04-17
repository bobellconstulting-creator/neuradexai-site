import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jarvis / Axon HUD',
  description:
    'Private holographic command HUD for Jarvis, Axon, and operator-grade agent orchestration.',
  keywords: [
    'Jarvis',
    'Axon',
    'mission control',
    'AI HUD',
    'agent orchestration',
    'holographic interface',
  ],
  openGraph: {
    title: 'Jarvis / Axon HUD',
    description:
      'Private holographic command HUD for Jarvis, Axon, and operator-grade agent orchestration.',
    url: 'https://jarvis-axon-hud.local',
    siteName: 'Jarvis / Axon HUD',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jarvis / Axon HUD',
    description: 'Private holographic mission control for Jarvis and Axon.',
  },
  applicationName: 'Jarvis',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Jarvis',
  },
  manifest: '/manifest.json',
  formatDetection: {
    telephone: false,
  },
  robots: { index: true, follow: true },
  metadataBase: new URL('https://jarvis-axon-hud.local'),
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000810',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
