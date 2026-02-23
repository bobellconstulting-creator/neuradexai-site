import type { Metadata } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Neuradex AI — Architect Your Digital Empire',
  description:
    'Deploying autonomous AI agent swarms to revolutionize complex industries. The digital factory behind BuckGrid Pro and next-generation AI infrastructure.',
  keywords: [
    'AI agents',
    'autonomous AI',
    'agent swarms',
    'AI SaaS',
    'BuckGrid Pro',
    'Neuradex AI',
  ],
  openGraph: {
    title: 'Neuradex AI — Architect Your Digital Empire',
    description:
      'Deploying autonomous AI agent swarms to revolutionize complex industries.',
    url: 'https://neuradexai.com',
    siteName: 'Neuradex AI',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Neuradex AI',
    description: 'Autonomous AI agent swarms for complex industries.',
  },
  robots: { index: true, follow: true },
  metadataBase: new URL('https://neuradexai.com'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="min-h-screen flex flex-col overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
