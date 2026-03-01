type BrandMarkProps = {
  className?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`inline-block ${className}`.trim()}
      role="img"
      aria-label="Analog Research logo"
    >
      <rect x="0" y="0" width="100" height="100" rx="20" fill="hsl(var(--primary))" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="7.5" />
      <circle cx="50" cy="50" r="10" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="7.5" />
      <circle cx="50" cy="50" r="3.5" fill="hsl(var(--primary-foreground))" />
    </svg>
  )
}
