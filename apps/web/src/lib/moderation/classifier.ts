import { callOpenRouterModeration, OpenRouterTimeoutError, type OpenRouterModerationMeta, type OpenRouterModerationResult } from './openrouter-client'
import type { ModerationRuntimeConfig } from './types'

export interface ModelClassificationResult {
  status: 'ok' | 'timeout' | 'error'
  output: OpenRouterModerationResult | null
  model: string | null
  error: string | null
  attempts: Array<{
    model: string
    strict: boolean
    status: 'ok' | 'timeout' | 'error'
    error: string | null
    meta: OpenRouterModerationMeta | null
    output: OpenRouterModerationResult | null
  }>
}

function compactContent(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return input.slice(0, maxChars)
}

export async function runModelClassification(
  content: string,
  config: ModerationRuntimeConfig,
): Promise<ModelClassificationResult> {
  const trimmed = compactContent(content, config.maxInputChars)
  const attempts: ModelClassificationResult['attempts'] = []

  try {
    const primary = await callOpenRouterModeration({
      model: config.modelPrimary,
      timeoutMs: config.timeoutMs,
      content: trimmed,
      policyVersion: config.policyVersion,
      strict: false,
    })

    attempts.push({
      model: config.modelPrimary,
      strict: false,
      status: 'ok',
      error: null,
      meta: primary.meta,
      output: primary.output,
    })

    if (primary.output.needs_escalation) {
      const escalation = await callOpenRouterModeration({
        model: config.modelEscalation,
        timeoutMs: config.timeoutMs,
        content: trimmed,
        policyVersion: config.policyVersion,
        strict: true,
      })

      attempts.push({
        model: config.modelEscalation,
        strict: true,
        status: 'ok',
        error: null,
        meta: escalation.meta,
        output: escalation.output,
      })

      return {
        status: 'ok',
        output: escalation.output,
        model: config.modelEscalation,
        error: null,
        attempts,
      }
    }

    return {
      status: 'ok',
      output: primary.output,
      model: config.modelPrimary,
      error: null,
      attempts,
    }
  } catch (error) {
    if (error instanceof OpenRouterTimeoutError) {
      attempts.push({
        model: config.modelPrimary,
        strict: false,
        status: 'timeout',
        error: error.message,
        meta: {
          duration_ms: error.durationMs,
          http_status: 0,
          request_id: null,
          response_id: null,
          response_model: null,
          usage: null,
        },
        output: null,
      })

      return {
        status: 'timeout',
        output: null,
        model: config.modelPrimary,
        error: error.message,
        attempts,
      }
    }

    // One strict retry for parse/format issues
    try {
      attempts.push({
        model: config.modelPrimary,
        strict: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown model error',
        meta: null,
        output: null,
      })

      const retry = await callOpenRouterModeration({
        model: config.modelPrimary,
        timeoutMs: config.timeoutMs,
        content: trimmed,
        policyVersion: config.policyVersion,
        strict: true,
      })

      attempts.push({
        model: config.modelPrimary,
        strict: true,
        status: 'ok',
        error: null,
        meta: retry.meta,
        output: retry.output,
      })

      return {
        status: 'ok',
        output: retry.output,
        model: config.modelPrimary,
        error: null,
        attempts,
      }
    } catch (retryError) {
      if (retryError instanceof OpenRouterTimeoutError) {
        attempts.push({
          model: config.modelPrimary,
          strict: true,
          status: 'timeout',
          error: retryError.message,
          meta: {
            duration_ms: retryError.durationMs,
            http_status: 0,
            request_id: null,
            response_id: null,
            response_model: null,
            usage: null,
          },
          output: null,
        })

        return {
          status: 'timeout',
          output: null,
          model: config.modelPrimary,
          error: retryError.message,
          attempts,
        }
      }

      attempts.push({
        model: config.modelPrimary,
        strict: true,
        status: 'error',
        error: retryError instanceof Error ? retryError.message : 'Unknown model error',
        meta: null,
        output: null,
      })

      return {
        status: 'error',
        output: null,
        model: config.modelPrimary,
        error: retryError instanceof Error ? retryError.message : 'Unknown model error',
        attempts,
      }
    }
  }
}
