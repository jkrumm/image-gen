import { env } from '../env.js'
import type { Cost, Usage } from '@image-gen/shared'
import { log } from './log.js'

/**
 * Fire-and-forget telemetry POST to argo. Strict no-op when the env vars are
 * unset; failures are logged, never thrown, and never block the caller.
 */
export async function reportUsage(args: {
  requestId: string
  model: string
  usage: Usage
  cost: Cost
  durationMs: number
}): Promise<void> {
  if (!env.ARGO_USAGE_URL || !env.ARGO_API_SECRET) return
  const usageUrl = env.ARGO_USAGE_URL
  const apiSecret = env.ARGO_API_SECRET

  try {
    const now = new Date().toISOString()
    const record = {
      source: 'image-gen-gateway',
      source_id: args.requestId,
      grain: 'request',
      ts: now,
      ingested_at: now,
      model: args.model,
      model_norm: args.model,
      project: null,
      workspace: null,
      sub_tool: null,
      machine: env.MACHINE,
      billing: 'iu',
      outcome: 'ok',
      input_tokens: args.usage.input_tokens,
      output_tokens: args.usage.output_tokens,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      duration_ms: args.durationMs,
      cost_usd: args.cost.usd,
      cost_source: args.cost.source,
      raw: null,
    }

    await fetch(usageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiSecret}`,
      },
      body: JSON.stringify({ records: [record] }),
    })
  } catch (err) {
    log('usage.report_failed', { error: String(err) })
  }
}
