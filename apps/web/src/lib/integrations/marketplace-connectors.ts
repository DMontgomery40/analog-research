export const MARKETPLACE_CONNECTOR_STATUSES = [
  'live',
  'partner_onboarding',
  'researching',
] as const

export type MarketplaceConnectorStatus = (typeof MARKETPLACE_CONNECTOR_STATUSES)[number]

export interface MarketplaceConnector {
  id: 'analogresearch' | 'proxypics' | 'upwork' | 'thumbtack' | 'taskrabbit' | 'fiverr'
  displayName: string
  status: MarketplaceConnectorStatus
  integrationPath: string
  workerSignal: string
  summary: string
  supportsColdOutreach: false
}

const connectorStatusOrder: Record<MarketplaceConnectorStatus, number> = {
  live: 0,
  partner_onboarding: 1,
  researching: 2,
}

export const RAISED_HAND_MARKETPLACE_CONNECTORS: MarketplaceConnector[] = [
  {
    id: 'analogresearch',
    displayName: 'Analog Research Marketplace',
    status: 'live',
    integrationPath: 'REST API + MCP (available now)',
    workerSignal: 'Humans create profiles with skills, rates, and availability.',
    summary: 'Direct matching and booking for workers who explicitly opted in on-platform.',
    supportsColdOutreach: false,
  },
  {
    id: 'proxypics',
    displayName: 'ProxyPics',
    status: 'live',
    integrationPath: 'Provider API + Webhooks (available now)',
    workerSignal: 'Vetted field agents accepting drive-by verification and photo tasks.',
    summary: 'Live field-check fulfillment integration for on-platform workflows that need real-world visual verification.',
    supportsColdOutreach: false,
  },
  {
    id: 'upwork',
    displayName: 'Upwork',
    status: 'partner_onboarding',
    integrationPath: 'GraphQL + OAuth2 (partner/commercial approval path)',
    workerSignal: 'Freelancers with active public work profiles.',
    summary: 'Planned connector path for opt-in freelance talent once approvals and scopes are cleared.',
    supportsColdOutreach: false,
  },
  {
    id: 'thumbtack',
    displayName: 'Thumbtack',
    status: 'partner_onboarding',
    integrationPath: 'Partner API + OAuth2 (access-request flow)',
    workerSignal: 'Professionals who opted in to receive customer requests.',
    summary: 'Planned partner connector for request/negotiation workflows with explicit account linking.',
    supportsColdOutreach: false,
  },
  {
    id: 'taskrabbit',
    displayName: 'Taskrabbit',
    status: 'partner_onboarding',
    integrationPath: 'Partner Platform API (business partnership route)',
    workerSignal: 'Taskers actively accepting marketplace work.',
    summary: 'Planned partner connector focused on approved API pathways for on-platform task lifecycle actions.',
    supportsColdOutreach: false,
  },
  {
    id: 'fiverr',
    displayName: 'Fiverr',
    status: 'researching',
    integrationPath: 'Developer ecosystem + waitlist programs',
    workerSignal: 'Sellers listing services in Fiverr categories.',
    summary: 'Research in progress on official, policy-compliant APIs for marketplace workflows.',
    supportsColdOutreach: false,
  },
]

export function listRaisedHandMarketplaceConnectors(): MarketplaceConnector[] {
  return [...RAISED_HAND_MARKETPLACE_CONNECTORS].sort((left, right) => {
    return connectorStatusOrder[left.status] - connectorStatusOrder[right.status]
  })
}

export function formatMarketplaceConnectorStatus(status: MarketplaceConnectorStatus): string {
  if (status === 'live') return 'Live'
  if (status === 'partner_onboarding') return 'Partner Onboarding'
  return 'Researching'
}
