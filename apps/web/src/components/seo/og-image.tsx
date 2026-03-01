import type { ReactNode } from 'react'

const ACCENT = '#0d9488'

export function OgBackground({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(135deg, #020617 0%, #0f172a 55%, #020617 100%)',
        color: '#e2e8f0',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: ACCENT,
        }}
      />
      {children}
    </div>
  )
}

export function OgBrand({
  size = 'large',
}: {
  size?: 'large' | 'small'
}) {
  const isLarge = size === 'large'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isLarge ? 18 : 14 }}>
      <div
        style={{
          width: isLarge ? 56 : 48,
          height: isLarge ? 56 : 48,
          borderRadius: isLarge ? 16 : 14,
          background: ACCENT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isLarge ? 30 : 26,
          fontWeight: 900,
          color: '#042f2e',
        }}
      >
        A
      </div>
      <div
        style={{
          fontSize: isLarge ? 52 : 30,
          fontWeight: 900,
          letterSpacing: isLarge ? -1 : undefined,
          color: '#f8fafc',
        }}
      >
        Analog Research
      </div>
    </div>
  )
}

export function OgChip({ children }: { children: string }) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: 999,
        border: '1px solid rgba(13, 148, 136, 0.55)',
        background: 'rgba(13, 148, 136, 0.10)',
        color: '#5eead4',
        fontSize: 20,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  )
}

