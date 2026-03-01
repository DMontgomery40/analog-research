import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MCP Documentation | Analog Research',
  description: 'Connect your AI assistant to Analog Research using the Model Context Protocol. Browse humans, create bounties, manage bookings.',
}

export default function MCPLayout({ children }: { children: React.ReactNode }) {
  return children
}
