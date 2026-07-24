import { Elysia } from 'elysia'
import {
  errorResponseSchema,
  planRequestSchema,
  planResponseSchema,
  type Usage,
} from '@image-gen/shared'
import { env } from '../env.js'
import { planFromRequest } from '../lib/enhance.js'
import { computeCost } from '../lib/pricing.js'
import { reportUsage } from '../lib/usage.js'
import { log } from '../lib/log.js'

export const enhanceRoutes = new Elysia().post(
  '/enhance',
  async ({ body, status }) => {
    const requestId = crypto.randomUUID()
    const t0 = performance.now()

    let result
    try {
      result = await planFromRequest(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'upstream request failed'
      log('enhance.upstream_error', { error: message, requestId })
      return status(502, { error: { message, type: 'upstream_error' } })
    }

    const latencyMs = Math.round(performance.now() - t0)

    // Chat-completions usage (prompt_tokens/completion_tokens) has no
    // text/image split, unlike the image endpoints' `input_tokens_details` —
    // this is a pure-text call, so `input_tokens_details` is left unset
    // rather than guessed at. Summed across both LLM calls if the plan
    // needed a retry (see `requestLlmPlan`).
    const usage: Usage = {
      input_tokens: result.usage.prompt_tokens,
      output_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.total_tokens,
    }
    // Priced from `pricing.ts`'s TEXT_RATES, not RATES — a text model, not an
    // image one. A model missing from that table still yields
    // `{ usd: null, source: 'none' }`, which argo renders as $0.
    const cost = computeCost(env.ENHANCE_MODEL, usage)

    void reportUsage({
      requestId,
      model: env.ENHANCE_MODEL,
      subTool: 'enhance',
      usage,
      cost,
      durationMs: latencyMs,
    })

    return result.response
  },
  {
    body: planRequestSchema,
    response: {
      200: planResponseSchema,
      502: errorResponseSchema,
    },
    detail: {
      tags: ['Prompts'],
      summary: 'Plan an image generation from a brief',
      description:
        'Compiles the versioned playbook (`shared/playbook/`) into a system prompt, asks the enhance model (`ENHANCE_MODEL`) for a single structured plan, then resolves the proposed settings through `rules.ts`, runs a server-side verbatim containment check, and estimates cost — before any image is generated. Never generates an image; the caller reviews the plan, then calls `/generate` or `/edit` with the returned settings. Supports fresh briefs and delta iteration on an accepted `current_prompt`.',
      security: [{ BearerAuth: [] }],
    },
  },
)
