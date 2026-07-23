import { z } from 'zod'

/**
 * Every model that may appear in a historical sidecar or usage record. NEVER
 * remove an entry — `listGenerations()` (app) silently skips sidecars that
 * fail to parse, so dropping a value here makes existing library entries
 * vanish instead of erroring. Use this for anything that validates
 * stored/historical data.
 */
export const KNOWN_IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini'] as const
export type KnownImageModel = (typeof KNOWN_IMAGE_MODELS)[number]

/**
 * Models the studio will generate with today. Safe to shrink — retiring a
 * model from generation only ever removes it from here, never from
 * `KNOWN_IMAGE_MODELS`. Use this for anything that validates a new request or
 * describes a response to one.
 */
export const IMAGE_MODELS = ['gpt-image-2'] as const
export type ImageModel = (typeof IMAGE_MODELS)[number]

export const DEFAULT_MODEL: ImageModel = 'gpt-image-2'

/**
 * Per-model capabilities, verified by live probe against the upstream endpoint
 * (2026-07-16 — see docs/research/endpoint-verification.md). These are model
 * properties, not endpoint properties: each holds identically on
 * `/images/generations` and `/images/edits`. Keyed by `KnownImageModel` (not
 * `ImageModel`) because the app still renders capability-derived info for
 * historical generations and replay must know what a legacy model supported.
 */
export const MODEL_CAPABILITIES = {
  'gpt-image-2': {
    /** Accepts arbitrary `WxH` within GPT_IMAGE_2_SIZE; others take presets only. */
    customSize: true,
    /** gpt-image-2 rejects `background: "transparent"` outright — no generatable model supports it. */
    transparentBackground: false,
    /** gpt-image-2 is locked to high fidelity and 400s if `input_fidelity` is sent at all. */
    inputFidelity: false,
  },
  'gpt-image-1.5': {
    customSize: false,
    transparentBackground: true,
    inputFidelity: true,
  },
  'gpt-image-1-mini': {
    customSize: false,
    transparentBackground: true,
    inputFidelity: false,
  },
} as const satisfies Record<
  KnownImageModel,
  {
    customSize: boolean
    transparentBackground: boolean
    inputFidelity: boolean
  }
>

/** Sizes every model accepts. gpt-image-2 additionally accepts arbitrary `WxH`. */
export const SIZE_PRESETS = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const
export type SizePreset = (typeof SIZE_PRESETS)[number]

// gpt-image-2 arbitrary-size constraints (edges multiples of 16, ratio <= 3:1,
// 655_360..8_294_400 total px, max edge < 3840). Sizes above 2560x1440 are
// experimental upstream.
export const GPT_IMAGE_2_SIZE = {
  edgeMultiple: 16,
  maxRatio: 3,
  minPixels: 655_360,
  maxPixels: 8_294_400,
  maxEdge: 3839,
} as const

/** Upstream limits for the edit path, from docs/research/image-api.md. */
export const EDIT_LIMITS = {
  maxImages: 16,
  maxImageBytes: 50 * 1024 * 1024,
  maxMaskBytes: 4 * 1024 * 1024,
} as const

export const INPUT_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Fields shared by the generate and edit requests. */
const commonImageFields = {
  prompt: z.string().min(1).max(32_000),
  model: z.enum([...IMAGE_MODELS, 'auto'] as const).default('auto'),
  size: z
    .string()
    .regex(/^(auto|\d{2,4}x\d{2,4})$/, "size must be 'auto' or 'WxH'")
    .default('auto'),
  quality: z.enum(['low', 'medium', 'high', 'auto']).default('auto'),
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
   * Model the client asked for. Also `IMAGE_MODELS`: the request schema above
   * only accepts a currently-generatable model (or `auto`), so nothing else
   * can reach this field on a fresh response.
   */
  requested_model: z.enum([...IMAGE_MODELS, 'auto'] as const),
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
