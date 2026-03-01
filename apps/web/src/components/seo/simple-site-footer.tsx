'use client'

import { FounderAttributionLinks } from '@/components/seo/founder-attribution-links'
import { BRAND_NAME } from '@/lib/brand'

type SimpleSiteFooterProps = {
  tagline: string
  footerClassName?: string
  containerClassName?: string
}

export function SimpleSiteFooter({
  tagline,
  footerClassName = 'border-t border-border py-8 mt-12',
  containerClassName = 'container mx-auto px-4 text-center text-sm text-muted-foreground',
}: SimpleSiteFooterProps) {
  return (
    <footer className={footerClassName}>
      <div className={containerClassName}>
        <p>
          &copy; {new Date().getFullYear()} {BRAND_NAME}. {tagline}
        </p>
        <p className="mt-2">
          <FounderAttributionLinks />
        </p>
      </div>
    </footer>
  )
}
