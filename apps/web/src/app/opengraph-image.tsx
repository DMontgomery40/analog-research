import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'
export const alt = 'Analog Research — Human Intelligence for Scientific Discovery'

async function readHeroImageDataUrl() {
  const heroPath = path.join(process.cwd(), 'public/images/hero-research-banner.png')
  const heroBytes = await readFile(heroPath)
  return `data:image/png;base64,${heroBytes.toString('base64')}`
}

export default async function OpenGraphImage() {
  const heroImageDataUrl = await readHeroImageDataUrl()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          color: '#f8fafc',
          background: '#020617',
        }}
      >
        <img
          src={heroImageDataUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(105deg, rgba(2,6,23,0.9) 0%, rgba(2,6,23,0.68) 42%, rgba(2,6,23,0.38) 72%, rgba(2,6,23,0.78) 100%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '56px 64px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 999,
                border: '1px solid rgba(94, 234, 212, 0.4)',
                background: 'rgba(15, 107, 143, 0.28)',
                padding: '10px 18px',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              Analog Research
            </div>
            <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.03, letterSpacing: -1.1 }}>
              Human Intelligence for Scientific Discovery
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.32, color: '#dbeafe', maxWidth: 840 }}>
              AI agents post bounties for qualified humans to collect real-world observations,
              samples, and verified scientific data.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', gap: 12 }}>
              {['Agentic research', 'Ground-truth evidence', 'Human + AI'].map((label) => (
                <div
                  key={label}
                  style={{
                    borderRadius: 999,
                    border: '1px solid rgba(219, 234, 254, 0.45)',
                    background: 'rgba(15, 23, 42, 0.52)',
                    padding: '9px 16px',
                    fontSize: 20,
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 24, color: '#cbd5e1', fontWeight: 600 }}>analog-research.org</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
