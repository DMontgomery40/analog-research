import type {
  Resource,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js'
import type { McpUiResourceUri } from 'analogresearch-mcp/tools'

import { CHATGPT_UI_RESOURCE_URIS } from '@/lib/mcp/chatgpt-ui-mapping'

const MCP_APP_HTML_MIME = 'text/html;profile=mcp-app'
const DEFAULT_CONNECT_DOMAIN = 'https://api.analog-research.org'
const DEFAULT_RESOURCE_DOMAIN = 'https://analog-research.org'
const DEFAULT_WIDGET_DOMAIN = 'https://analog-research.org'

type ChatGptResourceDefinition = {
  resource: Resource
  html: string
  meta: Record<string, unknown>
}

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, '')
}

function resolveDomains() {
  const connectDomains = new Set<string>([DEFAULT_CONNECT_DOMAIN])
  const resourceDomains = new Set<string>([DEFAULT_RESOURCE_DOMAIN])

  const rawValues = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]

  for (const raw of rawValues) {
    const value = (raw || '').trim()
    if (!value) continue
    try {
      const origin = normalizeOrigin(new URL(value).origin)
      resourceDomains.add(origin)
      connectDomains.add(origin)
      if (origin.includes('analog-research.org')) {
        connectDomains.add(DEFAULT_CONNECT_DOMAIN)
      }
    } catch {
      continue
    }
  }

  return {
    connectDomains: Array.from(connectDomains),
    resourceDomains: Array.from(resourceDomains),
  }
}

function resolveWidgetDomain(): string {
  const candidates = [
    process.env.MCP_WIDGET_DOMAIN,
    process.env.NEXT_PUBLIC_WIDGET_DOMAIN,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]

  for (const raw of candidates) {
    const value = (raw || '').trim()
    if (!value) continue
    try {
      return normalizeOrigin(new URL(value).origin)
    } catch {
      continue
    }
  }

  return DEFAULT_WIDGET_DOMAIN
}

function buildTemplateHtml(params: {
  title: string
  subtitle: string
  accent: string
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${params.title}</title>
    <style>
      :root {
        --bg: #f7f7f5;
        --surface: #ffffff;
        --text: #1d1b16;
        --muted: #6d665d;
        --accent: ${params.accent};
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background:
          radial-gradient(80rem 40rem at 110% -10%, rgba(0, 0, 0, 0.04), transparent 60%),
          linear-gradient(180deg, #faf9f7 0%, var(--bg) 100%);
        color: var(--text);
        font: 500 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
      }
      .shell {
        margin: 0 auto;
        max-width: 900px;
        padding: 20px 16px 28px;
      }
      .hero {
        background: var(--surface);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 2px 14px rgba(0, 0, 0, 0.05);
      }
      .eyebrow {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--muted);
      }
      h1 {
        margin: 6px 0 2px;
        font-size: 22px;
        line-height: 1.15;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      .bar {
        margin-top: 14px;
        border-radius: 999px;
        height: 6px;
        background: color-mix(in srgb, var(--accent) 26%, #fff);
      }
      .card {
        margin-top: 14px;
        background: var(--surface);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 16px;
        overflow: hidden;
      }
      .card h2 {
        margin: 0;
        padding: 12px 14px;
        font-size: 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      pre {
        margin: 0;
        padding: 12px 14px 14px;
        white-space: pre-wrap;
        word-break: break-word;
        font: 500 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: #2f2a22;
      }
      @media (max-width: 640px) {
        .shell {
          padding: 14px 12px 18px;
        }
        h1 {
          font-size: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">Analog Research MCP App</div>
        <h1>${params.title}</h1>
        <p>${params.subtitle}</p>
        <div class="bar"></div>
      </section>
      <section class="card">
        <h2>Latest Tool Result</h2>
        <pre id="payload">Waiting for MCP tool data...</pre>
      </section>
    </main>
    <script>
      ;(async () => {
        const el = document.getElementById('payload')
        const safeWrite = (value) => {
          if (!el) return
          el.textContent = value
        }

        const bridge = window.openai
        if (!bridge || typeof bridge.getModelContext !== 'function') {
          safeWrite('window.openai bridge unavailable.')
          return
        }

        try {
          const context = await bridge.getModelContext()
          const payload = context?.toolResult?.structuredContent ?? context?.structuredContent ?? null
          safeWrite(payload ? JSON.stringify(payload, null, 2) : 'No structured content.')
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          safeWrite('Failed to read model context: ' + message)
        }
      })()
    </script>
  </body>
</html>`
}

function createWidgetMeta(description: string): Record<string, unknown> {
  const { connectDomains, resourceDomains } = resolveDomains()
  const widgetDomain = resolveWidgetDomain()

  return {
    ui: {
      csp: {
        connectDomains,
        resourceDomains,
        frameDomains: [],
      },
      domain: widgetDomain,
    },
    'openai/widgetDescription': description,
  }
}

function createResourceDefinition(params: {
  uri: McpUiResourceUri
  name: string
  description: string
  title: string
  subtitle: string
  accent: string
}): ChatGptResourceDefinition {
  const meta = createWidgetMeta(params.description)

  return {
    resource: {
      uri: params.uri,
      name: params.name,
      description: params.description,
      mimeType: MCP_APP_HTML_MIME,
      _meta: meta,
    },
    html: buildTemplateHtml({
      title: params.title,
      subtitle: params.subtitle,
      accent: params.accent,
    }),
    meta,
  }
}

export const CHATGPT_RESOURCE_REGISTRY: Record<McpUiResourceUri, ChatGptResourceDefinition> = {
  [CHATGPT_UI_RESOURCE_URIS.generic]: createResourceDefinition({
    uri: CHATGPT_UI_RESOURCE_URIS.generic,
    name: 'Analog Research Generic Result Shell',
    description: 'Default UI shell for Analog Research MCP tool results',
    title: 'Analog Research Result Shell',
    subtitle: 'Shared output template for tools without specialized layouts.',
    accent: '#2e5f4f',
  }),
  [CHATGPT_UI_RESOURCE_URIS.humans]: createResourceDefinition({
    uri: CHATGPT_UI_RESOURCE_URIS.humans,
    name: 'Analog Research Humans Browser',
    description: 'UI template for human discovery and profile-oriented MCP tools',
    title: 'Humans Discovery',
    subtitle: 'View candidates, skills, availability, and review summaries.',
    accent: '#0f6b7a',
  }),
  [CHATGPT_UI_RESOURCE_URIS.bounties]: createResourceDefinition({
    uri: CHATGPT_UI_RESOURCE_URIS.bounties,
    name: 'Analog Research Bounty Board',
    description: 'UI template for bounty creation, listing, and application workflows',
    title: 'Bounty Operations',
    subtitle: 'Inspect bounty state, budget bands, and application actions.',
    accent: '#7c4a08',
  }),
  [CHATGPT_UI_RESOURCE_URIS.conversations]: createResourceDefinition({
    uri: CHATGPT_UI_RESOURCE_URIS.conversations,
    name: 'Analog Research Conversations Workspace',
    description: 'UI template for conversation and messaging MCP tools',
    title: 'Conversation Workspace',
    subtitle: 'Track message threads and handoff decisions in one pane.',
    accent: '#5c3fb4',
  }),
  [CHATGPT_UI_RESOURCE_URIS.bookings]: createResourceDefinition({
    uri: CHATGPT_UI_RESOURCE_URIS.bookings,
    name: 'Analog Research Booking Console',
    description: 'UI template for booking, escrow, and proof review MCP tools',
    title: 'Booking + Escrow Console',
    subtitle: 'Audit funding state, proof outcomes, and settlement status.',
    accent: '#8e2f45',
  }),
}

export function listChatGptResources(): Resource[] {
  return Object.values(CHATGPT_RESOURCE_REGISTRY).map((entry) => entry.resource)
}

export function readChatGptResource(uri: string): TextResourceContents | null {
  const resource = CHATGPT_RESOURCE_REGISTRY[uri as McpUiResourceUri]
  if (!resource) {
    return null
  }

  return {
    uri,
    mimeType: MCP_APP_HTML_MIME,
    text: resource.html,
    _meta: resource.meta,
  }
}

export { MCP_APP_HTML_MIME }
