import { env } from '../env.js'
import type { Cost, Usage } from '@image-gen/shared'
import { log } from './log.js'

/**
 * Which route produced the record. Argo groups on `sub_tool`, so without this
 * every generation, edit and plan collapses into one `(unset)` bucket.
 */
export type UsageSubTool = 'generate' | 'edit' | 'enhance'

/**
 * Fire-and-forget telemetry POST to argo. Strict no-op when the env vars are
 * unset; failures are logged, never thrown, and never block the caller.
 */
export async function reportUsage(args: {
  requestId: string
  model: string
  subTool: UsageSubTool
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
      // argo's ingest derives `workspace` from `project` only for path-driven
      // sources (claude-code, litellm) and leaves it NULL otherwise — and its
      // dashboard filters workspace with an `IN (...)` list, which never matches
      // NULL. A service that omits these disappears from every chart the moment
      // the Private/Work filter is touched, so both are declared explicitly.
      project: 'image-gen',
      workspace: 'private',
      sub_tool: args.subTool,
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

    const res = await fetch(usageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiSecret}`,
      },
      body: JSON.stringify({ records: [record] }),
    })

    // fetch only rejects on network failure, so an auth or schema rejection from
    // argo would otherwise drop the record in total silence.
    if (!res.ok) {
      log('usage.report_rejected', { status: res.status, statusText: res.statusText })
    }
  } catch (err) {
    log('usage.report_failed', { error: String(err) })
  }
}
