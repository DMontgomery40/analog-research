export type ModerationProvider = 'openrouter'

export type ModerationDecision = 'allow' | 'warn' | 'fail' | 'unscanned'
export type SpamAction = 'none' | 'cooldown' | 'suppress' | 'block'
export type ModerationSurface = 'bounty' | 'application' | 'message' | 'conversation_initial'
export type ActorType = 'human' | 'agent'

export type HardFailReasonCode =
  | 'PHISHING_CREDENTIAL_THEFT'
  | 'SEED_OR_PRIVATE_KEY_REQUEST'
  | 'PROMPT_INJECTION_SECRET_EXFIL'
  | 'MALWARE_OR_EXECUTION_TRAP'
  | 'UPFRONT_PAYMENT_DECEPTION_HIGH_CONFIDENCE'

export type WarningReasonCode =
  | 'SUSPICIOUS_EXTERNAL_LINK'
  | 'OFF_PLATFORM_REDIRECT_REQUEST'
  | 'AMBIGUOUS_FINANCIAL_RISK'
  | 'SOCIAL_ENGINEERING_PATTERN_LOW_CONFIDENCE'

export type SpamReasonCode =
  | 'DUPLICATE_CAMPAIGN'
  | 'HIGH_VELOCITY_POSTING'
  | 'LOW_ENTROPY_TEMPLATE_SPAM'
  | 'LINK_FARM_PATTERN'

export type ModerationReasonCode = HardFailReasonCode | WarningReasonCode | SpamReasonCode

export interface ModerationRuntimeConfig {
  provider: ModerationProvider
  modelPrimary: string
  modelEscalation: string
  timeoutMs: number
  failConfidence: number
  warnConfidence: number
  maxInputChars: number
  dailyTokenBudget: number
  policyVersion: string
}

export interface ModerationInput {
  surface: ModerationSurface
  actorType: ActorType
  actorId: string
  content: string
  contentType: string
  contentId?: string
  metadata?: Record<string, unknown>
}

export interface ModerationClassifierOutput {
  decision_suggestion: Exclude<ModerationDecision, 'unscanned'>
  reason_codes: ModerationReasonCode[]
  risk_score: number
  confidence: number
  spam_score: number
  needs_escalation: boolean
  summary: string
}

export interface ModerationResult {
  decision: ModerationDecision
  reasonCodes: ModerationReasonCode[]
  riskScore: number
  confidence: number
  spamAction: SpamAction
  policyVersion: string
  provider: ModerationProvider
  model: string | null
  summary: string
  needsRescan: boolean
  timedOut: boolean
  contentHash: string
  evidence: Record<string, unknown>
}

export interface PersistModerationEventInput {
  surface: ModerationSurface
  contentType: string
  contentId: string | null
  actorType: ActorType
  actorId: string
  result: ModerationResult
}

export interface QueueModerationRescanInput {
  surface: ModerationSurface
  contentType: string
  contentId: string | null
  actorType: ActorType
  actorId: string
  contentText: string
  reason: string
}
