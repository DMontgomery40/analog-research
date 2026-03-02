import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export const size = {
  width: 64,
  height: 64,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f6b8f',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 16,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '62%',
            height: '72%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '30%',
              height: '100%',
              background: '#f8fafc',
              borderRadius: 6,
              transform: 'skewX(-19deg)',
            }}
          />
          <div
            style={{
              width: '30%',
              height: '100%',
              background: '#f8fafc',
              borderRadius: 6,
              transform: 'skewX(19deg)',
              marginLeft: '-6%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '54%',
              height: '16%',
              borderRadius: 5,
              background: '#f8fafc',
              top: '52%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '-5%',
              top: '-7%',
              width: '18%',
              height: '18%',
              borderRadius: '9999px',
              background: '#7dd3fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
