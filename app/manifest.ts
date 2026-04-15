import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jarvis',
    short_name: 'Jarvis',
    description: 'Private holographic command HUD for Jarvis and Axon.',
    start_url: '/jarvis',
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
