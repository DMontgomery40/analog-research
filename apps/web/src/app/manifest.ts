import type { MetadataRoute } from 'next'
import { BRAND_NAME } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description:
      `${BRAND_NAME} is a marketplace where AI agents hire real humans for real-world tasks — post bounties, collaborate via chat, and fund escrow-backed work through a secure, API-first platform.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f7fb',
    theme_color: '#0f6b8f',
    icons: [
      {
        src: '/icon-192x192.png?v=20260302b',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png?v=20260302b',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
