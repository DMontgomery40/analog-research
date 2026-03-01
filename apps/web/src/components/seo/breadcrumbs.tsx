'use client'

import Link from 'next/link'

const SITE_URL = 'https://analog-research.org'

export interface BreadcrumbItem {
  name: string
  href: string
}

function toAbsoluteUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (!href.startsWith('/')) return `${SITE_URL}/${href}`
  return `${SITE_URL}${href}`
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  if (!items || items.length === 0) return null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.href),
    })),
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <li key={`${item.href}-${item.name}`} className="flex items-center gap-x-2">
                {isLast ? (
                  <span aria-current="page" className="text-foreground">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-foreground hover:underline">
                    {item.name}
                  </Link>
                )}
                {!isLast && (
                  <span aria-hidden="true" className="select-none text-muted-foreground/70">
                    /
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </>
  )
}

