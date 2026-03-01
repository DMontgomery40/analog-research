import { ImageResponse } from 'next/og'

export const runtime = 'edge'

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
          borderRadius: 14,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '64%',
            height: '64%',
            borderRadius: '9999px',
            border: '8px solid white',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '42%',
              height: '42%',
              borderRadius: '9999px',
              border: '8px solid white',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '34%',
                height: '34%',
                borderRadius: '9999px',
                background: 'white',
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
