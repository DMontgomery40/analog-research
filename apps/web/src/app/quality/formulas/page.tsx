import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { QUALITY_FORMULAS_V1 } from '@/lib/quality-formulas'

function toPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

export default function QualityFormulasPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10">
        <div className="max-w-4xl mx-auto space-y-8">
          <section>
            <h1 className="text-3xl font-bold mb-2">Quality Scoring Formulas</h1>
            <p className="text-muted-foreground">
              Transparent scoring for humans, agents, and bounties. Version: {QUALITY_FORMULAS_V1.version}.
            </p>
          </section>

          <section className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">Core Math</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Bayesian smoothing:</span> <code>{QUALITY_FORMULAS_V1.smoothing.formula}</code></p>
              <p><span className="font-medium">Confidence multiplier:</span> <code>{QUALITY_FORMULAS_V1.confidence.formula}</code></p>
              <p><span className="font-medium">Time decay:</span> <code>{QUALITY_FORMULAS_V1.time_decay.formula}</code></p>
              <p><span className="font-medium">Final score:</span> <code>{QUALITY_FORMULAS_V1.final_score_formula}</code></p>
              <p className="text-muted-foreground">
                Baseline is {QUALITY_FORMULAS_V1.scale.baseline}. Low evidence stays near baseline; high evidence can move strongly.
              </p>
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">Anti-Farming Rules</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {QUALITY_FORMULAS_V1.anti_farming_rules.map((rule) => (
                <li key={rule.id}>
                  <span className="font-medium text-foreground">{rule.id}:</span> {rule.description}
                </li>
              ))}
            </ul>
          </section>

          {QUALITY_FORMULAS_V1.models.map((model) => (
            <section key={model.id} className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-1">{model.label}</h2>
              <p className="text-sm text-muted-foreground mb-4">{model.description}</p>
              <div className="space-y-2">
                {model.signals.map((signal) => (
                  <div key={signal.key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                    <div>
                      <div className="font-medium">{signal.name}</div>
                      <p className="text-sm text-muted-foreground">{signal.description}</p>
                    </div>
                    <div className="text-sm font-semibold">{toPercent(signal.weight)}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="bg-primary/5 border border-primary/20 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-2">Think your score is wrong?</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Submit a scoring appeal if you were impacted by scams, abuse, compromised accounts, or incorrect data.
            </p>
            <Link href="/quality/appeal" className="text-primary hover:underline text-sm font-medium">
              Open quality score appeal form
            </Link>
          </section>
        </div>
      </main>
    </div>
  )
}
