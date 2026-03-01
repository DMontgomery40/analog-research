import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { OgBackground, OgBrand, OgChip } from '@/components/seo/og-image'

export const runtime = 'edge'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

type HumanOgPayload = {
  name: string
  skills: string[]
}

async function getBaseUrlFromHeaders(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'analog-research.org'
  const proto = headersList.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

async function getHumanForOg(id: string): Promise<HumanOgPayload | null> {
  const baseUrl = await getBaseUrlFromHeaders()

  const response = await fetch(`${baseUrl}/api/v1/humans/${id}`, {
    next: { revalidate: 300 },
  })

  if (!response.ok) return null

  const json = (await response.json()) as {
    success?: boolean
    data?: { name?: string; skills?: string[] }
  }

  const name = json.data?.name
  if (!name) return null

  return {
    name,
    skills: Array.isArray(json.data?.skills) ? json.data!.skills!.filter(Boolean) : [],
  }
}

export default async function HumanOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const human = await getHumanForOg(id)

  const title = human?.name ?? 'Human profile'
  const skills = (human?.skills ?? []).slice(0, 8)

  return new ImageResponse(
    (
      <OgBackground>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <OgBrand size="small" />
          <div style={{ fontSize: 56, fontWeight: 900, color: '#f8fafc', letterSpacing: -1 }}>
            {title}
          </div>
          <div style={{ fontSize: 24, color: '#94a3b8', lineHeight: 1.4, maxWidth: 920 }}>
            Hire this human for real-world tasks and project-based work — escrow-backed, API-first.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {skills.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {skills.map((skill) => (
                <OgChip key={skill}>{skill}</OgChip>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 22, color: '#94a3b8' }}>Profile skills and availability</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 22, color: '#94a3b8' }}>analog-research.org</div>
            <div style={{ fontSize: 22, color: '#94a3b8' }}>Human profile</div>
          </div>
        </div>
      </OgBackground>
    ),
    {
      ...size,
    }
  )
}
