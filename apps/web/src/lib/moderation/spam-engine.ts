import { createHash } from 'crypto'
import type { ModerationReasonCode, ModerationSurface, SpamAction, ActorType } from './types'

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function shannonEntropy(input: string): number {
  if (!input) return 0
  const counts = new Map<string, number>()
  for (const char of input) {
    counts.set(char, (counts.get(char) || 0) + 1)
  }

  let entropy = 0
  for (const count of counts.values()) {
    const p = count / input.length
    entropy -= p * Math.log2(p)
  }

  return entropy
}

export function buildHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export interface SpamAssessment {
  action: SpamAction
  score: number
  reasonCodes: ModerationReasonCode[]
  evidence: Record<string, unknown>
}

export async function assessSpam(params: {
  supabase: any
  surface: ModerationSurface
  actorType: ActorType
  actorId: string
  normalizedContent: string
  urls: string[]
  contentHash: string
}): Promise<SpamAssessment> {
  const { supabase, surface, actorId, actorType, normalizedContent, urls, contentHash } = params
  const reasons: ModerationReasonCode[] = []

  const now = Date.now()
  const since24h = new Date(now - 1000 * 60 * 60 * 24).toISOString()
  const since5m = new Date(now - 1000 * 60 * 5).toISOString()

  const { data: duplicates } = await supabase
    .from('spam_fingerprints')
    .select('actor_id')
    .eq('surface', surface)
    .eq('content_hash', contentHash)
    .gte('created_at', since24h)

  const duplicateRows = duplicates || []
  const duplicateCount = duplicateRows.length
  const uniqueActors = new Set(duplicateRows.map((row: { actor_id: string }) => row.actor_id)).size

  const { data: recentEvents } = await supabase
    .from('moderation_events')
    .select('id')
    .eq('actor_id', actorId)
    .gte('created_at', since5m)

  const actorVelocityCount = (recentEvents || []).length

  const entropy = shannonEntropy(normalizedContent)
  const hasLowEntropySpam = normalizedContent.length > 120 && entropy < 2.5

  if (duplicateCount >= 3 && uniqueActors >= 2) {
    reasons.push('DUPLICATE_CAMPAIGN')
  }

  if (actorVelocityCount >= 10) {
    reasons.push('HIGH_VELOCITY_POSTING')
  }

  if (hasLowEntropySpam) {
    reasons.push('LOW_ENTROPY_TEMPLATE_SPAM')
  }

  const uniqueDomains = new Set(
    urls
      .map((value) => {
        try {
          return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  )

  if (uniqueDomains.size >= 3) {
    reasons.push('LINK_FARM_PATTERN')
  }

  let score = 0.05
  score += Math.min(duplicateCount / 8, 0.45)
  score += Math.min(actorVelocityCount / 25, 0.35)
  score += hasLowEntropySpam ? 0.15 : 0
  score += uniqueDomains.size >= 3 ? 0.1 : 0

  let action: SpamAction = 'none'
  if (duplicateCount >= 8 || actorVelocityCount >= 25) {
    action = 'block'
  } else if (actorVelocityCount >= 12) {
    action = 'cooldown'
  } else if (duplicateCount >= 4 && uniqueActors >= 2) {
    action = 'suppress'
  }

  const { error: fingerprintError } = await supabase
    .from('spam_fingerprints')
    .insert({
      surface,
      actor_type: actorType,
      actor_id: actorId,
      content_hash: contentHash,
      simhash: contentHash,
      primary_domain: uniqueDomains.values().next().value || null,
    })

  // Spam fingerprinting should never block the primary operation.
  // Best-effort only (avoid unhandled rejections).
  if (fingerprintError) {
    // Intentionally ignore.
  }

  if (duplicateCount >= 3) {
    const clusterKey = `${surface}:${contentHash}`
    const { error: clusterError } = await supabase
      .from('spam_clusters')
      .upsert({
        cluster_key: clusterKey,
        content_hash: contentHash,
        surface,
        dominant_reason: reasons[0] || null,
        volume: duplicateCount + 1,
        actor_count: Math.max(uniqueActors, 1),
        status: 'active',
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'cluster_key' })

    if (clusterError) {
      // Intentionally ignore.
    }
  }

  return {
    action,
    score: Math.max(0, Math.min(1, score)),
    reasonCodes: unique(reasons),
    evidence: {
      duplicateCount,
      uniqueActors,
      actorVelocityCount,
      entropy,
      uniqueDomainCount: uniqueDomains.size,
    },
  }
}
