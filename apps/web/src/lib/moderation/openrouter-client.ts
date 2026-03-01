import { z } from 'zod'

const openRouterResponseSchema = z.object({
  decision_suggestion: z.enum(['allow', 'warn', 'fail']),
  reason_codes: z.array(z.string()).default([]),
  risk_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  spam_score: z.number().min(0).max(1),
  needs_escalation: z.boolean().default(false),
  summary: z.string().max(280),
})

export type OpenRouterModerationResult = z.infer<typeof openRouterResponseSchema>

export interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface OpenRouterModerationMeta {
  duration_ms: number
  http_status: number
  request_id: string | null
  response_id: string | null
  response_model: string | null
  usage: OpenRouterUsage | null
}

export interface OpenRouterModerationCall {
  output: OpenRouterModerationResult
  meta: OpenRouterModerationMeta
}

export class OpenRouterTimeoutError extends Error {
  readonly durationMs: number

  constructor(durationMs: number) {
    super('OpenRouter moderation request timed out')
    this.name = 'OpenRouterTimeoutError'
    this.durationMs = durationMs
  }
}

function parseModelOutput(raw: unknown): OpenRouterModerationResult {
  if (typeof raw === 'string') {
    return openRouterResponseSchema.parse(JSON.parse(raw))
  }

  if (Array.isArray(raw)) {
    const textPart = raw.find((entry) => typeof entry === 'object' && entry !== null && 'text' in entry) as { text?: string } | undefined
    if (textPart?.text) {
      return openRouterResponseSchema.parse(JSON.parse(textPart.text))
    }
  }

  if (typeof raw === 'object' && raw !== null) {
    return openRouterResponseSchema.parse(raw)
  }

  throw new Error('Unable to parse OpenRouter moderation output')
}

export async function callOpenRouterModeration(params: {
  model: string
  timeoutMs: number
  content: string
  policyVersion: string
  strict?: boolean
}): Promise<OpenRouterModerationCall> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is missing')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs)
  const startedAt = Date.now()

  const instruction = params.strict
    ? 'Return valid JSON only. No markdown, no prose, no code fences.'
    : 'Return compact JSON.'

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0,
        max_tokens: 220,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'moderation_output',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['decision_suggestion', 'reason_codes', 'risk_score', 'confidence', 'spam_score', 'needs_escalation', 'summary'],
              properties: {
                decision_suggestion: { type: 'string', enum: ['allow', 'warn', 'fail'] },
                reason_codes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'PHISHING_CREDENTIAL_THEFT',
                      'SEED_OR_PRIVATE_KEY_REQUEST',
                      'PROMPT_INJECTION_SECRET_EXFIL',
                      'MALWARE_OR_EXECUTION_TRAP',
                      'UPFRONT_PAYMENT_DECEPTION_HIGH_CONFIDENCE',
                      'SUSPICIOUS_EXTERNAL_LINK',
                      'OFF_PLATFORM_REDIRECT_REQUEST',
                      'AMBIGUOUS_FINANCIAL_RISK',
                      'SOCIAL_ENGINEERING_PATTERN_LOW_CONFIDENCE',
                      'DUPLICATE_CAMPAIGN',
                      'HIGH_VELOCITY_POSTING',
                      'LOW_ENTROPY_TEMPLATE_SPAM',
                      'LINK_FARM_PATTERN',
                    ],
                  },
                },
                risk_score: { type: 'number', minimum: 0, maximum: 1 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                spam_score: { type: 'number', minimum: 0, maximum: 1 },
                needs_escalation: { type: 'boolean' },
                summary: { type: 'string', maxLength: 280 },
              },
            },
          },
        },
        messages: [
          {
            role: 'system',
            content: [
              'You are a marketplace safety classifier.',
              'Policy is narrow: block only imminent technical harm and explicit high-confidence payment deception scams.',
              'Do not enforce broad legal, AML, or general financial suitability judgments.',
              'Allow weird/novel tasks unless concrete danger exists.',
              `Policy version: ${params.policyVersion}.`,
              instruction,
            ].join(' '),
          },
          {
            role: 'user',
            content: params.content,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter error: ${response.status} ${errorText}`)
    }

    const payload = await response.json()
    const raw = payload?.choices?.[0]?.message?.content
    return {
      output: parseModelOutput(raw),
      meta: {
        duration_ms: Date.now() - startedAt,
        http_status: response.status,
        request_id: response.headers.get('x-request-id') || response.headers.get('cf-ray') || null,
        response_id: typeof payload?.id === 'string' ? payload.id : null,
        response_model: typeof payload?.model === 'string' ? payload.model : null,
        usage: payload?.usage && typeof payload.usage === 'object' ? payload.usage : null,
      },
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OpenRouterTimeoutError(Date.now() - startedAt)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
