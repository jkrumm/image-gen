import { z } from 'zod'

/**
 * Every model that may appear in a historical sidecar or usage record. NEVER
 * remove an entry — `listGenerations()` (app) silently skips sidecars that
 * fail to parse, so dropping a value here makes existing library entries
 * vanish instead of erroring. Use this for anything that validates
 * stored/historical data.
 */
export const KNOWN_IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-1-mini',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
] as const
export type KnownImageModel = (typeof KNOWN_IMAGE_MODELS)[number]

/**
 * Models the studio will generate with today. Safe to shrink — retiring a
 * model from generation only ever removes it from here, never from
 * `KNOWN_IMAGE_MODELS`. Use this for anything that validates a new request or
 * describes a response to one.
 *
 * `gpt-image-2.5-flare` is speed-optimized (drafts, iteration); `sunburst` is
 * quality-optimized (editing precision, final renders) — see `resolveModel`
 * in `rules.ts` for the routing rule between the two. `gpt-image-2` left the
 * generate path 2026-09-23 in favor of these (undated alias ids, not the
 * dated `-2026-09-08` snapshots).
 */
export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const
export type ImageModel = (typeof IMAGE_MODELS)[number]

export const DEFAULT_MODEL: ImageModel = 'gpt-image-2.5-flare'

/**
 * Model ids a fresh **request** may still name that are NOT in `IMAGE_MODELS` — a narrow deploy
 * compat shim, not part of the studio's real model surface. The app build installed before this
 * migration (2026-09-23, when `IMAGE_MODELS` moved off `gpt-image-2`) sends `model: "gpt-image-2"`
 * explicitly (its era's `DEFAULT_MODEL`); without this, every one of its requests 422s until it is
 * rebuilt. `resolveModel`/`routingReason` (`rules.ts`) treat any id here exactly like `'auto'` for
 * routing, but report `routed: true` with a reason naming the retired id, so a still-live legacy
 * caller is visible in the response rather than silently laundered into an ordinary auto-route.
 *
 * The current app's own `model` state never assigns one of these — it types itself against
 * `ImageModel | 'auto'` directly rather than reusing `GenerateRequest['model']` for that reason.
 * Removable once no pre-2026-09-23 app build is installed (check `make app-status`'s fingerprint).
 */
export const LEGACY_REQUEST_MODELS = ['gpt-image-2'] as const
export type LegacyRequestModel = (typeof LEGACY_REQUEST_MODELS)[number]

/**
 * Per-model capabilities, verified by live probe against the upstream endpoint
 * (2026-07-16 for gpt-image-2/1.5/1-mini, 2026-09-23 for the 2.5 pair — see
 * docs/research/endpoint-verification.md). These are model properties, not
 * endpoint properties: each holds identically on `/images/generations` and
 * `/images/edits`. Keyed by `KnownImageModel` (not `ImageModel`) because the
 * app still renders capability-derived info for historical generations and
 * replay must know what a legacy model supported.
 */
export const MODEL_CAPABILITIES = {
  'gpt-image-2': {
    /** Accepts arbitrary `WxH` within GPT_IMAGE_2_SIZE; others take presets only. */
    customSize: true,
    /** gpt-image-2 rejects `background: "transparent"` outright. */
    transparentBackground: false,
    /** gpt-image-2 is locked to high fidelity and 400s if `input_fidelity` is sent at all. */
    inputFidelity: false,
    /** Retired before `xhigh`/`max` existed — never valid to send. */
    extendedQuality: false,
  },
  'gpt-image-1.5': {
    customSize: false,
    transparentBackground: true,
    inputFidelity: true,
    extendedQuality: false,
  },
  'gpt-image-1-mini': {
    customSize: false,
    transparentBackground: true,
    inputFidelity: false,
    extendedQuality: false,
  },
  'gpt-image-2.5-flare': {
    /** Accepts arbitrary `WxH` within GPT_IMAGE_2_SIZE, same envelope as gpt-image-2. */
    customSize: true,
    /** Real alpha channel — probe-verified `background: "transparent"` + png returns RGBA (colortype 6). */
    transparentBackground: true,
    /** Hard 400 "Unknown parameter: 'input_fidelity'" — probe-verified. */
    inputFidelity: false,
    /** Accepts `xhigh`/`max` in addition to the legacy `low|medium|high|auto` — probe-verified 200. */
    extendedQuality: true,
  },
  'gpt-image-2.5-sunburst': {
    customSize: true,
    transparentBackground: true,
    inputFidelity: false,
    extendedQuality: true,
  },
} as const satisfies Record<
  KnownImageModel,
  {
    customSize: boolean
    transparentBackground: boolean
    inputFidelity: boolean
    extendedQuality: boolean
  }
>

/** Sizes every model accepts. A `customSize`-capable model additionally accepts arbitrary `WxH`. */
export const SIZE_PRESETS = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const
export type SizePreset = (typeof SIZE_PRESETS)[number]

// Arbitrary-size constraints shared by every customSize-capable model (edges
// multiples of 16, ratio <= 3:1, 655_360..8_294_400 total px, max edge <
// 3840) — originally measured against gpt-image-2, re-verified against
// gpt-image-2.5-flare/sunburst (1536x640 and 3072x1024 both accepted).
// Sizes above 2560x1440 are experimental upstream. Named for the model it was
// first measured on; kept as-is rather than renamed as the envelope now
// serves every customSize model.
export const GPT_IMAGE_2_SIZE = {
  edgeMultiple: 16,
  maxRatio: 3,
  minPixels: 655_360,
  maxPixels: 8_294_400,
  maxEdge: 3839,
} as const

/** Upstream limits for the edit path (16 references, 50 MB each, 4 MB alpha-PNG mask). */
export const EDIT_LIMITS = {
  maxImages: 16,
  maxImageBytes: 50 * 1024 * 1024,
  maxMaskBytes: 4 * 1024 * 1024,
} as const

export const INPUT_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Fields shared by the generate and edit requests. */
const commonImageFields = {
  prompt: z.string().min(1).max(32_000),
  // Accepts LEGACY_REQUEST_MODELS alongside IMAGE_MODELS — a deploy compat shim, see its doc
  // comment in this file. `resolveModel` routes a legacy id exactly like `'auto'`.
  model: z.enum([...IMAGE_MODELS, ...LEGACY_REQUEST_MODELS, 'auto'] as const).default('auto'),
  size: z
    .string()
    .regex(/^(auto|\d{2,4}x\d{2,4})$/, "size must be 'auto' or 'WxH'")
    .default('auto'),
  quality: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'auto']).default('auto'),
  background: z.enum(['transparent', 'opaque', 'auto']).default('auto'),
  output_format: z.enum(['png', 'webp', 'jpeg']).default('png'),
  output_compression: z.number().int().min(0).max(100).optional(),
  n: z.number().int().min(1).max(10).default(1),
  moderation: z.enum(['auto', 'low']).default('auto'),
}

/**
 * Upstream rejects `partial_images > 0` together with `n > 1`
 * ("Streaming is only supported with n=1.") — enforce it here so the client
 * gets a local, precise error instead of a 503-wrapped upstream one.
 */
const streamingRequiresSingleImage = (
  req: { partial_images: number; n: number },
  ctx: z.RefinementCtx,
): void => {
  if (req.partial_images > 0 && req.n > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['partial_images'],
      message: 'streaming (partial_images > 0) is only supported with n=1',
    })
  }
}

export const generateRequestSchema = z
  .object({
    ...commonImageFields,
    /** Number of SSE preview frames to emit before the final image. 0 disables streaming. */
    partial_images: z.number().int().min(0).max(3).default(0),
  })
  .superRefine(streamingRequiresSingleImage)
export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type GenerateRequestInput = z.input<typeof generateRequestSchema>

/**
 * Non-file fields of `POST /edit`. The images and mask travel as multipart file
 * parts alongside these; on the wire every value is a string, so this schema
 * coerces rather than assuming JSON types.
 */
export const editRequestSchema = z
  .object({
    ...commonImageFields,
    output_compression: z.coerce.number().int().min(0).max(100).optional(),
    n: z.coerce.number().int().min(1).max(10).default(1),
    partial_images: z.coerce.number().int().min(0).max(3).default(0),
    /**
     * Only valid for models whose MODEL_CAPABILITIES.inputFidelity is true.
     * gpt-image-2 rejects the parameter outright ("does not support the
     * 'input_fidelity' parameter") — the gateway refuses it rather than
     * silently dropping a setting the caller explicitly asked for.
     */
    input_fidelity: z.enum(['high', 'low']).optional(),
  })
  .superRefine(streamingRequiresSingleImage)
export type EditRequest = z.infer<typeof editRequestSchema>
export type EditRequestInput = z.input<typeof editRequestSchema>

export const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  input_tokens_details: z
    .object({
      text_tokens: z.number().optional(),
      image_tokens: z.number().optional(),
      // Chat-completions cache-read tokens (`prompt_tokens_details.cached_tokens`
      // upstream) — a subset of `input_tokens`/`text_tokens`, not additive. Only
      // the `/enhance` planner call populates this; image endpoints never do.
      cached_tokens: z.number().optional(),
    })
    .optional(),
  output_tokens_details: z.record(z.string(), z.number()).optional(),
})
export type Usage = z.infer<typeof usageSchema>

export const costSchema = z.object({
  usd: z.number().nullable(),
  source: z.enum(['computed', 'none']),
})
export type Cost = z.infer<typeof costSchema>

export const generatedImageSchema = z.object({
  b64_json: z.string(),
  format: z.enum(['png', 'webp', 'jpeg']),
})
export type GeneratedImage = z.infer<typeof generatedImageSchema>

export const generateResponseSchema = z.object({
  id: z.string(),
  created: z.number(),
  /**
   * Model actually used after routing. `IMAGE_MODELS`, not
   * `KNOWN_IMAGE_MODELS`: this describes a run that just happened, and a run
   * can only ever happen on a model this build can still generate with.
   */
  model: z.enum(IMAGE_MODELS),
  /**
   * Model the client asked for, echoed verbatim — widened to
   * `LEGACY_REQUEST_MODELS` alongside `IMAGE_MODELS`/`'auto'` for the same
   * deploy-compat reason the request schema is: a pre-2026-09-23 app build's
   * `model: "gpt-image-2"` must round-trip into a valid response, not just a
   * valid request. Honest over convenient: echoing the literal value the
   * caller sent (rather than laundering it into `'auto'`) is what the
   * `KNOWN_IMAGE_MODELS`-based sidecar schema (`sidecar.ts`) already expects —
   * it has accepted every `KnownImageModel` here since before this shim
   * existed, so persisting this field verbatim was always going to parse.
   */
  requested_model: z.enum([...IMAGE_MODELS, ...LEGACY_REQUEST_MODELS, 'auto'] as const),
  /** True when the gateway overrode the requested model. */
  routed: z.boolean(),
  routing_reason: z.string().optional(),
  images: z.array(generatedImageSchema),
  size: z.string(),
  quality: z.string(),
  background: z.string(),
  usage: usageSchema,
  cost: costSchema,
  latency_ms: z.number(),
})
export type GenerateResponse = z.infer<typeof generateResponseSchema>

/** `POST /edit` returns the same envelope as `/generate`. */
export const editResponseSchema = generateResponseSchema
export type EditResponse = z.infer<typeof editResponseSchema>

/**
 * SSE frames emitted by `/generate` and `/edit` when `partial_images > 0`.
 * A stream is always terminated by exactly one `completed` or one `error` frame.
 *
 * Streaming implies a single image (upstream: "Streaming is only supported with
 * n=1"), so no image index is carried. Upstream may also deliver fewer partials
 * than requested when generation is fast — never wait for a fixed count.
 */
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('partial_image'),
    /** 0-based preview frame counter. */
    partial_image_index: z.number().int().min(0),
    b64_json: z.string(),
    format: z.enum(['png', 'webp', 'jpeg']),
  }),
  z.object({
    type: z.literal('completed'),
    response: generateResponseSchema,
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({ message: z.string(), type: z.string() }),
  }),
])
export type StreamEvent = z.infer<typeof streamEventSchema>

/**
 * `POST /enhance` — expand a short brief into a fuller image prompt via a text
 * model on the same upstream. Deliberately a separate round-trip rather than a
 * flag on `/generate`: the caller reviews (and may reject) the rewrite before
 * spending a generation on it.
 */
export const enhanceRequestSchema = z.object({
  brief: z.string().min(1).max(4_000),
  /** Optional steer, e.g. a composer preset id like "app-icon". */
  purpose: z.string().max(200).optional(),
})
export type EnhanceRequest = z.infer<typeof enhanceRequestSchema>
export type EnhanceRequestInput = z.input<typeof enhanceRequestSchema>

export const enhanceResponseSchema = z.object({
  /** The refined prompt. Never auto-applied — the client decides. */
  prompt: z.string(),
  /** Echoed so the caller can show what it sent vs. got back. */
  brief: z.string(),
  /** Text model that produced the rewrite. */
  model: z.string(),
  usage: usageSchema,
  cost: costSchema,
  latency_ms: z.number(),
})
export type EnhanceResponse = z.infer<typeof enhanceResponseSchema>

export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
  }),
})
export type ErrorResponse = z.infer<typeof errorResponseSchema>
