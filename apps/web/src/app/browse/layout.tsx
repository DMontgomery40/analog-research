import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Browse Humans | Analog Research',
  description: 'Find skilled humans available for hire. Filter by skills, rate, location, and availability.',
}

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return children
}
