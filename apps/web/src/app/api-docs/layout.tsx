import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'REST API Documentation | Analog Research',
  description: 'Programmatic access to Analog Research. Browse humans, post bounties, manage bookings and payments via REST API.',
}

export default function APIDocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
