import Link from 'next/link'
import { confidenceLabel } from '@/lib/quality-formulas'

interface QualityScoreBadgeProps {
  label: 'HLS' | 'ALS' | 'BLS'
  score: number | null | undefined
  confidence?: number | null | undefined
  className?: string
}

function scoreTone(score: number | null | undefined): string {
  const value = Number(score ?? 50)
  if (value >= 80) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
  if (value >= 65) return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
  if (value >= 45) return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  return 'bg-rose-500/10 text-rose-600 border-rose-500/20'
}

function confidenceTone(confidence: number | null | undefined): string {
  const tier = confidenceLabel(confidence)
  if (tier === 'high') return 'text-emerald-600'
  if (tier === 'medium') return 'text-amber-600'
  return 'text-muted-foreground'
}

export function QualityScoreBadge({ label, score, confidence, className = '' }: QualityScoreBadgeProps) {
  const numericScore = Number(score ?? 50)
  const numericConfidence = Number(confidence ?? 0)
  const tier = confidenceLabel(confidence)

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${scoreTone(numericScore)} ${className}`.trim()}>
      <span>{label}</span>
      <span>{numericScore.toFixed(1)}</span>
      <span className={`font-medium ${confidenceTone(numericConfidence)}`}>({tier})</span>
    </span>
  )
}

export function QualityFormulaLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm ${className}`.trim()}>
      <Link href="/quality/formulas" className="text-primary hover:underline">
        How scores are calculated
      </Link>
      <span className="text-muted-foreground">·</span>
      <Link href="/quality/appeal" className="text-primary hover:underline">
        Appeal or report a scoring issue
      </Link>
    </div>
  )
}
