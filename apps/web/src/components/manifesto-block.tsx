import * as React from 'react'

interface ManifestoBlockProps {
  children: React.ReactNode
  className?: string
}

export function ManifestoBlock({ children, className = '' }: ManifestoBlockProps) {
  return (
    <section className={`bg-slate-50 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="container mx-auto px-4 py-16 md:py-24">
        {children}
      </div>
    </section>
  )
}

interface ManifestoQuoteProps {
  children: React.ReactNode
}

export function ManifestoQuote({ children }: ManifestoQuoteProps) {
  return (
    <blockquote className="text-xl md:text-2xl text-slate-700 dark:text-slate-300 leading-relaxed max-w-4xl mx-auto text-center font-light italic border-l-0 pl-0">
      {children}
    </blockquote>
  )
}

interface DifferentiatorGridProps {
  children: React.ReactNode
}

export function DifferentiatorGrid({ children }: DifferentiatorGridProps) {
  return (
    <div className="grid md:grid-cols-3 gap-8 mt-16 max-w-5xl mx-auto">
      {children}
    </div>
  )
}

interface DifferentiatorCardProps {
  title: string
  items: string[]
}

export function DifferentiatorCard({ title, items }: DifferentiatorCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
      <h3 className="font-semibold text-lg mb-4 text-foreground">{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary mt-1">-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
