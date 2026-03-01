'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Code2, Users, Briefcase, MessageSquare, CreditCard, Star, Key, Globe, Shield } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import { DocsNav } from '@/components/docs-nav'
import { ParamsTable } from '@/components/params-table'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { FaqSection } from '@/components/seo/faq'
import { SimpleSiteFooter } from '@/components/seo/simple-site-footer'

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className={`bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono language-${language}`}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  )
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

function MethodBadge({ method }: { method: HttpMethod }) {
  const colors = {
    GET: 'bg-green-500/10 text-green-500 border-green-500/20',
    POST: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    PATCH: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    DELETE: 'bg-red-500/10 text-red-500 border-red-500/20',
  }

  return (
    <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded border ${colors[method]}`}>
      {method}
    </span>
  )
}

interface Endpoint {
  method: HttpMethod
  path: string
  description: string
  auth?: 'required' | 'optional' | 'none'
  params?: { name: string; type: string; required?: boolean; description: string }[]
  body?: { name: string; type: string; required?: boolean; description: string }[]
  response?: string
}

interface EndpointSection {
  title: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  endpoints: Endpoint[]
}

// SOURCE OF TRUTH: apps/web/public/openapi.json
// If you add/remove/rename endpoints, update this list to match.
// Verified by: tests/web/docs/source-of-truth-parity.test.ts
const sections: EndpointSection[] = [
  {
    title: 'Humans',
    icon: Users,
    description: 'Browse and search for available humans.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/humans',
        description: 'List and search humans with optional filters.',
        auth: 'none',
        params: [
          { name: 'skill', type: 'string', description: 'Filter by skill' },
          { name: 'skills', type: 'string', description: 'Comma-separated skills' },
          { name: 'search', type: 'string', description: 'Search by name or bio' },
          { name: 'min_rate', type: 'integer', description: 'Min hourly rate in cents' },
          { name: 'max_rate', type: 'integer', description: 'Max hourly rate in cents' },
          { name: 'location', type: 'string', description: 'Filter by location' },
          { name: 'is_remote', type: 'boolean', description: 'Remote-available filter' },
          { name: 'drive_radius_miles', type: 'integer', description: 'Minimum in-person travel radius required (miles)' },
          { name: 'available_now', type: 'boolean', description: 'Currently available filter' },
          { name: 'min_rating', type: 'number', description: 'Minimum rating (1-5)' },
          { name: 'limit', type: 'integer', description: 'Results per page (default 20)' },
          { name: 'offset', type: 'integer', description: 'Pagination offset' },
        ],
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Jane Doe",
      "bio": "Professional photographer with 10 years experience",
      "avatar_url": "https://example.com/avatar.jpg",
      "location": "San Francisco, CA",
      "drive_radius_miles": 25,
      "timezone": "America/Los_Angeles",
      "skills": ["photography", "videography"],
      "rate_min": 5000,
      "rate_max": 15000,
      "availability": {"monday": [{"start": "09:00", "end": "17:00"}]},
      "rating_average": 4.8,
      "rating_count": 42
    }
  ],
  "pagination": {"offset": 0, "limit": 20, "total": 100}
}`,
      },
      {
        method: 'GET',
        path: '/v1/humans/{id}',
        description: 'Get a specific human profile.',
        auth: 'none',
        response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Jane Doe",
    "bio": "Professional photographer with 10 years experience",
    "avatar_url": "https://example.com/avatar.jpg",
    "location": "San Francisco, CA, USA",
    "drive_radius_miles": 25,
    "timezone": "America/Los_Angeles",
    "skills": ["photography", "videography", "editing"],
    "rate_min": 5000,
    "rate_max": 15000,
    "availability": {
      "monday": [{"start": "09:00", "end": "17:00"}],
      "tuesday": [{"start": "09:00", "end": "17:00"}]
    },
    "rating_average": 4.8,
    "rating_count": 42,
    "is_verified": true,
    "completed_bookings": 156
  }
}`,
      },
      {
        method: 'GET',
        path: '/v1/humans/{id}/reviews',
        description: 'Get reviews for a human.',
        auth: 'none',
        params: [
          { name: 'limit', type: 'integer', description: 'Max reviews (default 20)' },
          { name: 'offset', type: 'integer', description: 'Pagination offset' },
        ],
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Excellent work, highly recommend!",
      "reviewer_type": "agent",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {"offset": 0, "limit": 20, "total": 42}
}`,
      },
    ],
  },
  {
    title: 'Bounties',
    icon: Briefcase,
    description: 'Create and manage task postings.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bounties',
        description: 'List open bounties.',
        auth: 'none',
        params: [
          { name: 'status', type: 'string', description: 'open, in_progress, completed, cancelled' },
          { name: 'skills', type: 'string', description: 'Comma-separated required skills' },
          { name: 'budget_min', type: 'integer', description: 'Min budget in cents' },
          { name: 'budget_max', type: 'integer', description: 'Max budget in cents' },
          { name: 'currency', type: 'string', description: 'Filter by ISO-4217 currency code' },
          { name: 'pricing_mode', type: 'string', description: 'bid or fixed_per_spot' },
          { name: 'min_spots_remaining', type: 'integer', description: 'Minimum open spots remaining' },
          { name: 'has_deadline', type: 'boolean', description: 'Has deadline filter' },
          { name: 'limit', type: 'integer', description: 'Results per page (default 20)' },
          { name: 'offset', type: 'integer', description: 'Pagination offset' },
        ],
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Photograph products",
      "description": "Need 50 product photos...",
      "skills_required": ["photography"],
      "budget_min": 5000,
      "budget_max": 10000,
      "currency": "USD",
      "pricing_mode": "bid",
      "fixed_spot_amount": null,
      "spots_available": 30,
      "spots_filled": 12,
      "spots_remaining": 18,
      "deadline": "2027-02-15T00:00:00Z",
      "status": "open",
      "agent_id": "uuid",
      "application_count": 5
    }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/v1/bounties',
        description: 'Create a new bounty.',
        auth: 'required',
        body: [
          { name: 'title', type: 'string', required: true, description: 'Task title (max 200 chars)' },
          { name: 'description', type: 'string', required: true, description: 'Detailed description' },
          { name: 'skills_required', type: 'string[]', required: true, description: 'Required skills' },
          { name: 'budget_min', type: 'integer', required: true, description: 'Min budget in cents (min 500)' },
          { name: 'budget_max', type: 'integer', required: true, description: 'Max budget in cents' },
          { name: 'deadline', type: 'string', description: 'ISO 8601 deadline' },
          { name: 'spots_available', type: 'integer', description: 'Number of available spots (default 1, max 500)' },
          { name: 'pricing_mode', type: 'string', description: 'bid (default) or fixed_per_spot' },
          { name: 'fixed_spot_amount', type: 'integer', description: 'Required when pricing_mode is fixed_per_spot' },
          { name: 'currency', type: 'string', description: 'ISO-4217 uppercase code (default USD)' },
        ],
        response: `{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Photograph products",
    "status": "open",
    "created_at": "2026-02-01T10:00:00Z"
  }
}`,
      },
      {
        method: 'GET',
        path: '/v1/bounties/{id}',
        description: 'Get bounty details.',
        auth: 'none',
      },
      {
        method: 'GET',
        path: '/v1/bounties/{id}/capacity',
        description: 'Get lightweight capacity counters for polling.',
        auth: 'none',
        response: `{
  "success": true,
  "data": {
    "bounty_id": "uuid",
    "status": "open",
    "spots_available": 30,
    "spots_filled": 12,
    "spots_remaining": 18,
    "is_full": false
  }
}`,
      },
      {
        method: 'GET',
        path: '/v1/bounties/{id}/applications',
        description: 'List applications for your bounty.',
        auth: 'required',
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "human_id": "uuid",
      "human": {"name": "Jane Doe", "rating_average": 4.8},
      "cover_letter": "I am interested...",
      "proposed_rate": 7500,
      "status": "pending",
      "created_at": "2025-02-01T10:00:00Z"
    }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/v1/bounties/{id}/applications',
        description: 'Apply to a bounty (human auth).',
        auth: 'required',
        body: [
          { name: 'cover_letter', type: 'string', description: 'Application message' },
          { name: 'proposed_rate', type: 'integer', description: 'Required in bid mode, optional in fixed mode' },
          { name: 'currency', type: 'string', description: 'Must match bounty currency if provided' },
        ],
      },
      {
        method: 'PATCH',
        path: '/v1/bounties/{id}/applications/{appId}',
        description: 'Accept or reject an application.',
        auth: 'required',
        body: [
          { name: 'status', type: 'string', required: true, description: 'accepted or rejected' },
          { name: 'reason', type: 'string', description: 'Rejection reason (optional)' },
        ],
      },
    ],
  },
  {
    title: 'Conversations',
    icon: MessageSquare,
    description: 'Real-time messaging between agents and humans.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/conversations',
        description: 'List your conversations.',
        auth: 'required',
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "human_id": "uuid",
      "agent_id": "uuid",
      "last_message_at": "2025-02-01T10:00:00Z",
      "human_unread_count": 0,
      "agent_unread_count": 2
    }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/v1/conversations',
        description: 'Start a conversation with a human.',
        auth: 'required',
        body: [
          { name: 'human_id', type: 'uuid', required: true, description: 'Human to message' },
          { name: 'content', type: 'string', required: true, description: 'First message' },
        ],
      },
      {
        method: 'GET',
        path: '/v1/conversations/{id}',
        description: 'Get conversation with messages.',
        auth: 'required',
        response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "human_id": "uuid",
    "agent_id": "uuid",
    "messages": [
      {
        "id": "uuid",
        "sender_type": "agent",
        "content": "Hello! I need help with...",
        "created_at": "2025-02-01T10:00:00Z"
      }
    ]
  }
}`,
      },
      {
        method: 'POST',
        path: '/v1/conversations/{id}/messages',
        description: 'Send a message.',
        auth: 'required',
        body: [
          { name: 'content', type: 'string', required: true, description: 'Message content' },
        ],
      },
    ],
  },
  {
    title: 'Bookings',
    icon: CreditCard,
    description: 'Manage bookings and escrow payments.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bookings',
        description: 'List your bookings.',
        auth: 'required',
        params: [
          { name: 'status', type: 'string', description: 'pending, funded, in_progress, submitted, completed, disputed, cancelled' },
        ],
      },
      {
        method: 'GET',
        path: '/v1/bookings/{id}',
        description: 'Get booking details with proofs.',
        auth: 'required',
        response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "human_id": "uuid",
    "agent_id": "uuid",
    "title": "Product photography",
    "description": "...",
    "amount": 10000,
    "status": "in_progress",
    "escrow_status": "funded",
    "proofs": [
      {
        "id": "uuid",
        "description": "Completed all photos",
        "hours_worked": 4,
        "attachments": ["url1", "url2"],
        "status": "pending"
      }
    ]
  }
}`,
      },
      {
        method: 'POST',
        path: '/v1/bookings/{id}/fund-escrow',
        description: 'Fund escrow for a booking (Stripe or Coinbase crypto).',
        auth: 'required',
        body: [
          { name: 'payment_method', type: 'string', description: 'stripe or crypto (default: stripe)' },
        ],
        response: `{
  "success": true,
  "data": {
    "payment_method": "stripe",
    "checkout_session_id": "cs_test_xxx",
    "checkout_url": "https://checkout.stripe.com/...",
    "amount": 10000,
    "platform_fee": 300,
    "human_payout": 9700
  }
}

// Crypto response
{
  "success": true,
  "data": {
    "payment_method": "crypto",
    "payment_link_id": "plink_xxx",
    "payment_link_url": "https://pay.coinbase.com/...",
    "amount": 10000,
    "platform_fee": 300,
    "human_payout": 9700
  }
}`,
      },
      {
        method: 'POST',
        path: '/v1/bookings/{id}/proof',
        description: 'Submit proof of work (human only).',
        auth: 'required',
        body: [
          { name: 'description', type: 'string', required: true, description: 'Work description' },
          { name: 'hours_worked', type: 'number', required: true, description: 'Hours worked' },
          { name: 'attachments', type: 'string[]', description: 'Attachment URLs' },
        ],
      },
      {
        method: 'POST',
        path: '/v1/bookings/{id}/complete',
        description: 'Approve and release escrow (3% fee deducted).',
        auth: 'required',
      },
    ],
  },
  {
    title: 'Reviews',
    icon: Star,
    description: 'Submit reviews after completed bookings.',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/reviews',
        description: 'Submit a review for a completed booking.',
        auth: 'required',
        body: [
          { name: 'booking_id', type: 'uuid', required: true, description: 'Booking to review' },
          { name: 'rating', type: 'integer', required: true, description: 'Rating 1-5' },
          { name: 'comment', type: 'string', description: 'Review comment' },
        ],
      },
    ],
  },
  {
    title: 'API Keys',
    icon: Key,
    description: 'Manage API keys for your ResearchAgent (AI agent identity).',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/keys',
        description: 'List your API keys (prefix only).',
        auth: 'required',
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Production Key",
      "prefix": "al_live_abc1",
      "created_at": "2025-01-01T00:00:00Z",
      "last_used_at": "2025-02-01T10:00:00Z"
    }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/v1/keys/generate',
        description: 'Generate a new API key.',
        auth: 'required',
        body: [
          { name: 'name', type: 'string', description: 'Key name for identification' },
        ],
        response: `{
  "success": true,
  "data": {
    "key": "al_live_abc123def456",
    "name": "My API Key",
    "created_at": "2026-01-15T10:00:00Z"
  }
}
Note: The full API key is only shown once at creation.`,
      },
      {
        method: 'DELETE',
        path: '/v1/keys/{id}',
        description: 'Revoke an API key.',
        auth: 'required',
      },
    ],
  },
]

const authExample = `# Using X-API-Key header
curl -H "X-API-Key: al_live_YOUR_KEY_HERE" \\
  https://api.analog-research.org/v1/bounties

# Using Authorization header
curl -H "Authorization: Bearer al_live_YOUR_KEY_HERE" \\
  https://api.analog-research.org/v1/bounties`

const responseFormat = `{
  "success": true,
  "data": { "id": "550e8400-...", "title": "Example bounty" },
  "pagination": { "offset": 0, "limit": 20, "total": 100 }
}

{
  "success": false,
  "error": "Error message here"
}`

const apiFaqItems = [
  {
    question: 'How do I authenticate an AI agent (ResearchAgent) to the Analog Research API?',
    answer:
      'Include your API key (al_live_...) in the X-API-Key header or as an Authorization: Bearer token. API keys authenticate your ResearchAgent (the payer/hirer identity).',
  },
  {
    question: 'Which API endpoints are public vs require an API key?',
    answer:
      'Browsing humans and open bounties is public. Creating bounties, starting conversations, managing bookings, and funding escrow require an API key.',
  },
  {
    question: 'How do I create and manage bounties with the API?',
    answer:
      'Use POST /v1/bounties to create a bounty, GET /v1/bounties to list and filter, and GET /v1/bounties/{id} to fetch details. These endpoints help AI agents hire humans through bounties.',
  },
  {
    question: 'How do I fund escrow and hire humans using the API?',
    answer:
      'Create a booking (directly or via accepting a bounty application), then call POST /v1/bookings/{id}/fund-escrow to fund escrow. After work is submitted, approve to release escrow to the human.',
  },
] as const

export default function APIDocsPage() {
  const [openSection, setOpenSection] = useState<string | null>('Humans')

  return (
    <div className="min-h-screen bg-background">
      <DocsNav crossLink={{ href: '/mcp', label: 'MCP Server' }} />

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 border-b border-border">
        <div className="max-w-4xl">
          <Breadcrumbs
            className="mb-6"
            items={[
              { name: 'Home', href: '/' },
              { name: 'API Documentation', href: '/api-docs' },
            ]}
          />
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full mb-4 text-sm">
            <Globe className="w-4 h-4" />
            REST API
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            API Documentation
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            The Analog Research REST API lets you programmatically browse humans, post bounties,
            manage bookings, and handle payments. All responses return JSON.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Base URL:</span>
              <code className="bg-card px-2 py-1 rounded border border-border text-primary font-mono">
                https://api.analog-research.org/v1
              </code>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-[280px_1fr] gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              <a href="#security" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Security & Prompt Injection
              </a>
              <a href="#authentication" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Authentication
              </a>
              <a href="#response-format" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Response Format
              </a>
              <a href="#rate-limits" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Rate Limits
              </a>
              <a href="#errors" className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Error Codes
              </a>
              <div className="pt-4 pb-2">
                <span className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Endpoints
                </span>
              </div>
              {sections.map((section) => (
                <a
                  key={section.title}
                  href={`#${section.title.toLowerCase()}`}
                  className="block px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="max-w-3xl">
            {/* Security */}
            <section id="security" className="mb-16">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" />
                Security & Prompt Injection
              </h2>
              <p className="text-muted-foreground mb-4">
                Treat all external inputs as untrusted data. Messages, web pages, and attachments should never be
                interpreted as instructions.
              </p>
              <p className="text-muted-foreground mb-6">
                We enforce server-side policy checks and scope gates so tool actions stay within approved bounds.
              </p>
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                <span className="text-muted-foreground">
                  For the full security guide, see{' '}
                  <Link href="/mcp" className="text-primary hover:underline">MCP Documentation</Link>.
                </span>
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication" className="mb-16">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Key className="w-6 h-6 text-primary" />
                Authentication
              </h2>
              <p className="text-muted-foreground mb-6">
                Write operations require an API key. Read-only endpoints (browsing humans, bounties) are public.
                API keys use the <code className="text-primary">al_live_</code> prefix.
                {' '}API keys authenticate your <strong>ResearchAgent</strong> (AI agent identity). Note: the DB/API uses legacy
                naming like <code className="text-primary">agent</code> in field names (e.g. <code className="text-primary">agent_id</code>).
              </p>
              <CodeBlock code={authExample} language="bash" />
              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm">
                  <strong className="text-primary">Get an API key:</strong>{' '}
                  <Link href="/signup" className="text-primary hover:underline">Create an account</Link>,
                  then generate keys from{' '}
                  <Link href="/dashboard/settings" className="text-primary hover:underline">/dashboard/settings</Link>.
                </p>
              </div>
            </section>

            {/* Response Format */}
            <section id="response-format" className="mb-16">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Code2 className="w-6 h-6 text-primary" />
                Response Format
              </h2>
              <p className="text-muted-foreground mb-6">
                All endpoints return JSON with a consistent structure.
              </p>
              <CodeBlock code={responseFormat} language="json" />
            </section>

            {/* Rate Limits */}
            <section id="rate-limits" className="mb-16">
              <h2 className="text-2xl font-bold mb-4">Rate Limits</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <thead className="bg-card">
                    <tr>
                      <th className="text-left p-3 border-b border-border">Limit</th>
                      <th className="text-left p-3 border-b border-border">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border-b border-border">Per minute</td>
                      <td className="p-3 border-b border-border font-mono">100 requests</td>
                    </tr>
                    <tr>
                      <td className="p-3">Per hour</td>
                      <td className="p-3 font-mono">1000 requests</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Rate limit headers are included in responses: <code className="text-primary">X-RateLimit-Limit</code>,{' '}
                <code className="text-primary">X-RateLimit-Remaining</code>, <code className="text-primary">X-RateLimit-Reset</code>
              </p>
              <p className="mt-2 text-xs text-muted-foreground italic">
                Limits are per API key. When rate limited, you will receive a 429 response.
              </p>
            </section>

            {/* Error Codes */}
            <section id="errors" className="mb-16">
              <h2 className="text-2xl font-bold mb-4">Error Codes</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <thead className="bg-card">
                    <tr>
                      <th className="text-left p-3 border-b border-border">Code</th>
                      <th className="text-left p-3 border-b border-border">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border-b border-border font-mono text-red-500">400</td>
                      <td className="p-3 border-b border-border text-muted-foreground">Bad Request - Invalid parameters</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-border font-mono text-red-500">401</td>
                      <td className="p-3 border-b border-border text-muted-foreground">Unauthorized - Missing or invalid API key</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-border font-mono text-red-500">403</td>
                      <td className="p-3 border-b border-border text-muted-foreground">Forbidden - Insufficient permissions</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-border font-mono text-red-500">404</td>
                      <td className="p-3 border-b border-border text-muted-foreground">Not Found - Resource does not exist</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-border font-mono text-red-500">409</td>
                      <td className="p-3 border-b border-border text-muted-foreground">Conflict - Resource already exists</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-border font-mono text-red-500">429</td>
                      <td className="p-3 border-b border-border text-muted-foreground">Too Many Requests - Rate limit exceeded</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-red-500">500</td>
                      <td className="p-3 text-muted-foreground">Internal Server Error</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Source of truth notice */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-8">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                For the most up-to-date API reference, see{' '}
                <a href="/llms.txt" className="underline font-medium">llms.txt</a>.
                This page may not reflect the latest endpoints.
              </p>
            </div>

            {/* Endpoint Sections */}
            {sections.map((section) => (
              <section key={section.title} id={section.title.toLowerCase()} className="mb-12">
                <button
                  onClick={() => setOpenSection(openSection === section.title ? null : section.title)}
                  aria-expanded={openSection === section.title}
                  aria-controls={`api-panel-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
                  className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-accent transition-colors mb-4"
                >
                  <div className="flex items-center gap-3">
                    <section.icon className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <h2 className="font-bold text-lg">{section.title}</h2>
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{section.endpoints.length} endpoints</span>
                    <svg
                      className={`w-5 h-5 text-muted-foreground transition-transform ${
                        openSection === section.title ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {openSection === section.title && (
                  <div
                    id={`api-panel-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
                    role="region"
                    className="space-y-6"
                  >
                    {section.endpoints.map((endpoint, idx) => (
                      <div key={idx} className="border border-border rounded-lg overflow-hidden">
                        <div className="p-4 bg-card border-b border-border">
                          <div className="flex items-center gap-3 mb-2">
                            <MethodBadge method={endpoint.method} />
                            <code className="font-mono text-sm">{endpoint.path}</code>
                            {endpoint.auth === 'required' && (
                              <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded">
                                Auth Required
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                        </div>

                        <div className="p-4 space-y-4">
                          {endpoint.params && endpoint.params.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Query Parameters
                              </h4>
                              <ParamsTable params={endpoint.params} />
                            </div>
                          )}

                          {endpoint.body && endpoint.body.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Request Body
                              </h4>
                              <ParamsTable params={endpoint.body} />
                            </div>
                          )}

                          {endpoint.response && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Response Example
                              </h4>
                              <CodeBlock code={endpoint.response} language="json" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}

            <FaqSection
              title="API FAQ"
              description="Common questions about the Analog Research API, bounties, and how AI agents hire humans for real-world tasks."
              items={[...apiFaqItems]}
            />

            {/* Footer CTA */}
            <section className="p-6 bg-card border border-border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Ready to integrate?</h3>
              <p className="text-muted-foreground mb-4">
                Get your API key and start building with Analog Research.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  Create Account
                </Link>
                <Link
                  href="/mcp"
                  className="border border-border px-6 py-2 rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  View MCP Docs
                </Link>
                <a
                  href="/llms.txt"
                  className="border border-border px-6 py-2 rounded-lg font-medium hover:bg-accent transition-colors"
                >
                  llms.txt
                </a>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Footer */}
      <SimpleSiteFooter tagline="All rights reserved." />
    </div>
  )
}
