import type { MetadataRoute } from 'next'

import { createServiceClient } from '@/lib/supabase/server'
import {
  getPublicShowcaseConfig,
  isPublicShowcaseCuratedMode,
  shouldFailClosedPublicHumans,
} from '@/lib/public-showcase'

export const revalidate = 3600

const SITE_URL = 'https://analog-research.org'

type HumanSitemapRow = {
  id: string
  updated_at: string | null
  created_at: string | null
}

function toAbsoluteUrl(pathname: string): string {
  if (!pathname.startsWith('/')) return `${SITE_URL}/${pathname}`
  return `${SITE_URL}${pathname}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const showcaseConfig = getPublicShowcaseConfig()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: toAbsoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: toAbsoluteUrl('/browse'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: toAbsoluteUrl('/bounties'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: toAbsoluteUrl('/mcp'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: toAbsoluteUrl('/api-docs'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: toAbsoluteUrl('/privacy'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/terms'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/contact'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/founding-partner-apply'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]

  try {
    if (shouldFailClosedPublicHumans(showcaseConfig)) {
      return staticEntries
    }

    const supabase = await createServiceClient()
    let query = supabase
      .from('humans')
      .select('id, updated_at, created_at')

    if (isPublicShowcaseCuratedMode(showcaseConfig)) {
      query = query.in('id', showcaseConfig.humanIds)
    } else {
      query = query.eq('is_verified', true)
    }

    const { data, error } = await query

    if (error || !data) {
      return staticEntries
    }

    const humanEntries: MetadataRoute.Sitemap = (data as HumanSitemapRow[]).map((row) => {
      const lastModifiedRaw = row.updated_at || row.created_at
      const lastModified = lastModifiedRaw ? new Date(lastModifiedRaw) : now

      return {
        url: toAbsoluteUrl(`/humans/${row.id}`),
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.7,
      }
    })

    return [...staticEntries, ...humanEntries]
  } catch {
    return staticEntries
  }
}
