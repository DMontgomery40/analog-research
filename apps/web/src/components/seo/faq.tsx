'use client'

export type FaqItem = {
  question: string
  answer: string
}

type FaqSectionProps = {
  id?: string
  title?: string
  description?: string
  items: FaqItem[]
  className?: string
}

export function FaqSection({
  id = 'faq',
  title = 'FAQ',
  description,
  items,
  className = 'mb-16',
}: FaqSectionProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <section id={id} className={className}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mb-6">{description}</p>
      ) : null}
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden bg-card">
        {items.map((item) => (
          <details key={item.question} className="group p-4">
            <summary className="cursor-pointer list-none font-semibold flex items-center justify-between gap-4">
              <span>{item.question}</span>
              <svg
                className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-3 text-sm text-muted-foreground">
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

