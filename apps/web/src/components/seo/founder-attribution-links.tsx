'use client'

type FounderAttributionLinksProps = {
  linkClassName?: string
  separatorClassName?: string
}

export function FounderAttributionLinks({
  linkClassName = 'hover:text-foreground transition-colors',
  separatorClassName = 'mx-2 text-muted-foreground/60',
}: FounderAttributionLinksProps) {
  return (
    <>
      <a
        href="https://www.linkedin.com/in/david-montgomery-5a07656b/"
        target="_blank"
        rel="noopener me"
        className={linkClassName}
      >
        Founded by David Montgomery
      </a>
      <span className={separatorClassName}>•</span>
      <a
        href="https://github.com/DMontgomery40/analog-research"
        target="_blank"
        rel="noopener me"
        className={linkClassName}
      >
        GitHub Repo
      </a>
    </>
  )
}
