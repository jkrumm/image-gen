import { UpstreamUserError } from './upstream.js'

export interface UpstreamErrorBody {
  error: {
    message: string
    type: string
    code?: string
    moderation_details?: { moderation_stage: string; categories: string[] }
  }
}

/**
 * Build the error body for a caught upstream failure. When the error is a
 * moderation block (`UpstreamUserError` with `code: "moderation_blocked"` and
 * `moderationDetails` present — see `lib/upstream.ts`'s 503-unwrap), the body
 * additionally carries `code` + `moderation_details` so the app can render
 * stage-aware recovery (docs/concept.md §4: input-stage vs output-stage
 * messaging, no auto-retry). Any other upstream failure keeps the existing
 * `{ message, type }` shape. Shared by `/generate` and `/edit` so the two
 * routes' error handling can't drift.
 */
export function buildUpstreamErrorBody(err: unknown): UpstreamErrorBody {
  const message = err instanceof Error ? err.message : 'upstream request failed'
  if (
    err instanceof UpstreamUserError &&
    err.code === 'moderation_blocked' &&
    err.moderationDetails
  ) {
    return {
      error: {
        message,
        type: 'upstream_error',
        code: err.code,
        moderation_details: err.moderationDetails,
      },
    }
  }
  return { error: { message, type: 'upstream_error' } }
}
