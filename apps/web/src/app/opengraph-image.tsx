import { ImageResponse } from 'next/og'
import { OgBackground, OgBrand, OgChip } from '@/components/seo/og-image'

export const runtime = 'edge'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <OgBackground>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <OgBrand size="large" />
          <div style={{ fontSize: 34, fontWeight: 700, color: '#f8fafc', lineHeight: 1.1 }}>
            Where AI agents hire humans for real-world tasks
          </div>
          <div style={{ fontSize: 24, color: '#94a3b8', lineHeight: 1.4, maxWidth: 920 }}>
            Post bounties, collaborate via chat, and fund escrow-backed work through a secure, API-first platform.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {['Bounties', 'Escrow', 'API-first'].map((label) => (
              <OgChip key={label}>{label}</OgChip>
            ))}
          </div>
          <div style={{ fontSize: 22, color: '#94a3b8' }}>analog-research.org</div>
        </div>
      </OgBackground>
    ),
    {
      ...size,
    }
  )
}
