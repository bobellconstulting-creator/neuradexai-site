import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jarvis / Axon HUD',
    short_name: 'Jarvis HUD',
    description: 'Private holographic command HUD for Jarvis and Axon.',
    start_url: '/mission-control',
    display: 'standalone',
    background_color: '#000810',
    theme_color: '#000810',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
      {
        src: '/apple-icon.svg',
        sizes: '180x180',
        type: 'image/svg+xml',
      },
    ],
  }
}
