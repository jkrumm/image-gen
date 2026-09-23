import {
  DEFAULT_MODEL,
  GPT_IMAGE_2_SIZE,
  IMAGE_MODELS,
  MODEL_CAPABILITIES,
  SIZE_PRESETS,
  type ImageModel,
  type KnownImageModel,
  type LegacyRequestModel,
} from './contract.js'

/**
 * The request rules both halves of the system must agree on, in one place.
 *
 * These were previously implemented three times — once in the gateway (to reject
 * bad requests) and twice in the app (to gate the UI). They agreed by luck, and a
 * drift between them silently re-opens the transparency/custom-size trap: the app
 * offers a combination the gateway then rejects. The gateway still owns
 * enforcement; the app uses these to keep invalid states unreachable.
 */

/** Quality tiers a request may name — see `MODEL_CAPABILITIES.extendedQuality`. */
export type RequestQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto'

const SUNBURST: ImageModel = 'gpt-image-2.5-sunburst'
const FLARE: ImageModel = 'gpt-image-2.5-flare'

function isFinalizingQuality(quality: RequestQuality): boolean {
  return quality === 'high' || quality === 'xhigh' || quality === 'max'
}

/** True when MODEL is a currently-generatable model (a member of `IMAGE_MODELS`) — as opposed to
 * `'auto'` or a `LegacyRequestModel`, both of which need routing. Named distinctly from the
 * `KnownImageModel`-keyed `isGeneratableModel` further down (different domain, same idea). */
function isExplicitModel(model: ImageModel | 'auto' | LegacyRequestModel): model is ImageModel {
  return (IMAGE_MODELS as readonly string[]).includes(model)
}

/** The model `'auto'` (or a retired id, see below) resolves to for ENDPOINT/QUALITY — the routing
 * rule itself, factored out so `resolveModel` and `routingReason` can't drift against each other. */
function autoRoutedModel(endpoint: 'generate' | 'edit', quality: RequestQuality): ImageModel {
  if (endpoint === 'edit') return SUNBURST
  return isFinalizingQuality(quality) ? SUNBURST : FLARE
}

/** Prose fragment naming *why* `autoRoutedModel` picked what it picked, without the model name —
 * `routingReason` prefixes it with `routed to <model> for `. */
function autoRoutingWhy(endpoint: 'generate' | 'edit', quality: RequestQuality): string {
  if (endpoint === 'edit') return 'editing/reference precision'
  return isFinalizingQuality(quality)
    ? `a ${quality}-quality final render`
    : `a ${quality === 'auto' ? 'default' : quality}-quality draft`
}

/**
 * Resolve the model that will actually serve a request. An explicit,
 * currently-generatable model is always honoured verbatim. `'auto'` — and a
 * `LegacyRequestModel` id (a retired model a pre-2026-09-23 app build may
 * still send; see `LEGACY_REQUEST_MODELS`'s doc comment) — are routed
 * identically, by endpoint and quality:
 *
 * - `/images/edits` always routes to `sunburst` — editing/reference precision
 *   matters more than the (token-identical) latency difference.
 * - `/images/generations` at `high`/`xhigh`/`max` routes to `sunburst` — the
 *   final render.
 * - `/images/generations` at `low`/`medium`/`auto` routes to `flare` — the
 *   draft/iteration loop, where flare's lower latency pays off.
 */
export function resolveModel(req: {
  model: ImageModel | 'auto' | LegacyRequestModel
  endpoint: 'generate' | 'edit'
  quality: RequestQuality
}): ImageModel {
  if (isExplicitModel(req.model)) return req.model
  return autoRoutedModel(req.endpoint, req.quality)
}

/**
 * Why a request was routed the way it was, for surfacing to the user. Null
 * whenever the caller named an explicit, currently-generatable model —
 * nothing was rerouted. A `LegacyRequestModel` id routes exactly like
 * `'auto'` (see `resolveModel`) but still reports `routed: true`, naming the
 * retired id, so a still-live pre-2026-09-23 app build is visible in the
 * response rather than silently laundered into an ordinary auto-route.
 */
export function routingReason(req: {
  model: ImageModel | 'auto' | LegacyRequestModel
  endpoint: 'generate' | 'edit'
  quality: RequestQuality
}): string | null {
  if (isExplicitModel(req.model)) return null
  const target = autoRoutedModel(req.endpoint, req.quality)
  const why = autoRoutingWhy(req.endpoint, req.quality)
  if (req.model === 'auto') return `routed to ${target} for ${why}`
  return `${req.model} is retired — routed to ${target} for ${why}`
}

/**
 * `background: "transparent"` needs an alpha channel. Both generatable models
 * support one (live-probed 2026-09-23: real RGBA, colortype 6) — this now
 * only rejects a legacy/unsupported model passed in directly (e.g. replay
 * naming a retired `KnownImageModel` before it is coerced). Takes a
 * `KnownImageModel` (not just `ImageModel`) so a caller replaying/displaying a
 * historical generation can validate against the model it actually ran on.
 */
export function validateBackgroundForModel(
  model: KnownImageModel,
  background: 'transparent' | 'opaque' | 'auto',
): string | null {
  if (background !== 'transparent') return null
  if (MODEL_CAPABILITIES[model].transparentBackground) return null
  return `${model} has no alpha channel and cannot generate a transparent background`
}

/**
 * `background: "transparent"` needs an output format with an alpha channel.
 * jpeg has none — reject the combination outright rather than letting upstream
 * silently drop transparency or 400 unhelpfully.
 */
export function validateTransparentOutputFormat(
  background: 'transparent' | 'opaque' | 'auto',
  outputFormat: 'png' | 'webp' | 'jpeg',
): string | null {
  if (background !== 'transparent') return null
  if (outputFormat !== 'jpeg') return null
  return 'a transparent background needs png or webp output — jpeg has no alpha channel'
}

/**
 * `xhigh`/`max` are only valid on a model with `MODEL_CAPABILITIES.extendedQuality`
 * — the legacy models (and a retired `gpt-image-2`) predate them and 400 on
 * an unrecognized quality value.
 */
export function validateQualityForModel(
  model: KnownImageModel,
  quality: RequestQuality,
): string | null {
  if (quality !== 'xhigh' && quality !== 'max') return null
  if (MODEL_CAPABILITIES[model].extendedQuality) return null
  return `${model} does not support quality "${quality}" (only low/medium/high/auto)`
}

const SIZE_PATTERN = /^(\d{2,4})x(\d{2,4})$/

export function isSizePreset(size: string): boolean {
  return (SIZE_PRESETS as readonly string[]).includes(size)
}

/**
 * Validate a size against a MODEL's constraints. Returns an error message, or
 * null when valid.
 *
 * The rule is per-model, NOT per-endpoint: it holds identically on
 * `/images/generations` and `/images/edits` (gpt-image-2 accepts arbitrary
 * sizes on both, verified up to 2560x1440; the others are presets-only on both).
 */
export function validateSizeForModel(model: KnownImageModel, size: string): string | null {
  if (isSizePreset(size)) return null

  if (!MODEL_CAPABILITIES[model].customSize) {
    return `${model} only supports these sizes: ${SIZE_PRESETS.join(', ')}`
  }

  const match = SIZE_PATTERN.exec(size)
  if (!match) return "size must be 'auto', a preset, or 'WxH'"

  const width = Number(match[1])
  const height = Number(match[2])
  const { edgeMultiple, maxRatio, minPixels, maxPixels, maxEdge } = GPT_IMAGE_2_SIZE

  if (width % edgeMultiple !== 0 || height % edgeMultiple !== 0) {
    return `width and height must be multiples of ${edgeMultiple}`
  }
  if (width > maxEdge || height > maxEdge) {
    return `width and height must not exceed ${maxEdge}px`
  }
  if (Math.max(width, height) / Math.min(width, height) > maxRatio) {
    return `aspect ratio must not exceed ${maxRatio}:1`
  }
  const pixels = width * height
  if (pixels < minPixels || pixels > maxPixels) {
    return `total pixel count must be between ${minPixels} and ${maxPixels}`
  }

  return null
}

function closestPreset(width: number, height: number): string {
  const inputRatio = width / height
  const presets = SIZE_PRESETS.filter((preset) => preset !== 'auto')
  let best: string = presets[0] ?? SIZE_PRESETS[1]
  let bestDiff = Infinity
  for (const preset of presets) {
    const match = SIZE_PATTERN.exec(preset)
    if (!match) continue
    const presetRatio = Number(match[1]) / Number(match[2])
    const diff = Math.abs(presetRatio - inputRatio)
    if (diff < bestDiff) {
      bestDiff = diff
      best = preset
    }
  }
  return best
}

/**
 * Snaps an arbitrary `WxH` into GPT_IMAGE_2_SIZE by scaling the ideal (fractional)
 * shape into the envelope, then rounding to the edge multiple. Floor-rounding is
 * preferred (it can never overshoot maxEdge/maxPixels); ceil-rounding is the
 * fallback when flooring undershoots minPixels. Independent per-axis rounding can
 * still drift the aspect ratio past maxRatio even though the fractional shape was
 * clamped, so a repair pass grows the shorter edge (never shrinks — that would
 * risk re-violating minPixels) back within ratio. A final clamp guards the
 * unlikely case that repair pushed a dimension past maxEdge/maxPixels. Proven by
 * property test (rules.test.ts) across ~400k random and boundary-targeted inputs,
 * not by this comment.
 */
function snapToGptImage2Envelope(width: number, height: number): string {
  const { edgeMultiple, maxRatio, minPixels, maxPixels, maxEdge } = GPT_IMAGE_2_SIZE

  // Ideal (fractional) shape: clamp aspect ratio, then scale to fit the pixel/edge envelope.
  let w = Math.max(width, 1)
  let h = Math.max(height, 1)
  if (w / h > maxRatio) w = h * maxRatio
  else if (h / w > maxRatio) h = w * maxRatio

  const downscale = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(maxPixels / (w * h)))
  w *= downscale
  h *= downscale
  if (w * h < minPixels) {
    const upscale = Math.sqrt(minPixels / (w * h))
    w *= upscale
    h *= upscale
  }

  // Round to the edge multiple, preferring floor (safe headroom to maxEdge/maxPixels);
  // fall back to ceil per-dimension if flooring undershoots minPixels or zeroes an edge.
  let rw = Math.floor(w / edgeMultiple) * edgeMultiple
  let rh = Math.floor(h / edgeMultiple) * edgeMultiple
  if (rw < edgeMultiple) rw = edgeMultiple
  if (rh < edgeMultiple) rh = edgeMultiple
  if (rw * rh < minPixels) {
    rw = Math.max(edgeMultiple, Math.ceil(w / edgeMultiple) * edgeMultiple)
    rh = Math.max(edgeMultiple, Math.ceil(h / edgeMultiple) * edgeMultiple)
  }

  // Independent per-dimension rounding can drift the ratio past maxRatio even though the
  // fractional shape was clamped — repair by growing the shorter edge (never shrinking, so
  // minPixels stays satisfied) up to the next multiple of edgeMultiple.
  if (rw / rh > maxRatio) {
    rh = Math.ceil(rw / maxRatio / edgeMultiple) * edgeMultiple
  } else if (rh / rw > maxRatio) {
    rw = Math.ceil(rh / maxRatio / edgeMultiple) * edgeMultiple
  }

  // Growing the shorter edge to fix ratio could, in principle, overshoot maxPixels/maxEdge;
  // clamp back down as a final safety net.
  if (rw > maxEdge) rw = Math.floor(maxEdge / edgeMultiple) * edgeMultiple
  if (rh > maxEdge) rh = Math.floor(maxEdge / edgeMultiple) * edgeMultiple
  if (rw * rh > maxPixels) {
    const scale = Math.sqrt(maxPixels / (rw * rh))
    rw = Math.floor((rw * scale) / edgeMultiple) * edgeMultiple
    rh = Math.floor((rh * scale) / edgeMultiple) * edgeMultiple
  }

  return `${rw}x${rh}`
}

/** True when MODEL is still generatable today (a member of `IMAGE_MODELS`). */
function isGeneratableModel(model: KnownImageModel): model is ImageModel {
  return (IMAGE_MODELS as readonly string[]).includes(model)
}

/**
 * Coerces any size string into one that is valid for the model that will
 * actually generate — the chokepoint every replay path must go through.
 * Accepts a `KnownImageModel` (not just `ImageModel`) because replay sources
 * its model from a sidecar, which may name a retired model: a sidecar
 * recorded against gpt-image-1.5 replays on `DEFAULT_MODEL` today (this
 * function has no endpoint/quality context to run the full `resolveModel`
 * routing rule, so it falls back to the default rather than sunburst), so the
 * size returned must be valid for that model, not for the legacy model the
 * sidecar names.
 *
 * Exists because gpt-image-2 (and its 2.5 successors) return non-16-divisible
 * dimensions for `size: "auto"` (observed live: a 1024x1024 reference image
 * produced a 1254x1254 output). The gateway records that dimension truthfully
 * into the sidecar's `params.size`, but a truthful `params.size` is not
 * necessarily a *replayable* one — re-sending "1254x1254" 400s upstream
 * ("width and height must be divisible by 16") and fails `validateSizeForModel`
 * locally too. Every path that turns a recorded size back into a request
 * (replay, re-edit, "use as seed") must snap it back into validity first.
 *
 * `'auto'`, exact presets, and anything `validateSizeForModel` already accepts
 * for the resolved generatable model are returned unchanged. A `WxH` on a
 * presets-only generatable model folds to the closest-aspect-ratio preset —
 * unreachable today since every generatable model accepts custom sizes, but
 * kept generic for when a presets-only model is generatable again. A `WxH` on
 * a customSize model is snapped into the shared `GPT_IMAGE_2_SIZE` envelope.
 * Unparseable input falls back to `'auto'` rather than throwing.
 */
export function snapSizeForModel(model: KnownImageModel, size: string): string {
  const generatableModel = isGeneratableModel(model) ? model : DEFAULT_MODEL

  if (validateSizeForModel(generatableModel, size) === null) return size

  const match = SIZE_PATTERN.exec(size)
  if (!match) return 'auto'

  const width = Number(match[1])
  const height = Number(match[2])

  if (!MODEL_CAPABILITIES[generatableModel].customSize) {
    return closestPreset(width, height)
  }

  return snapToGptImage2Envelope(width, height)
}

/**
 * `input_fidelity` is edits-only, and gpt-image-2 rejects it outright ("does not
 * support the 'input_fidelity' parameter") because it is locked to high fidelity
 * internally. We refuse rather than silently drop it — dropping a setting the
 * caller explicitly asked for is worse than a clear error. No other generatable
 * model exists to suggest as a fallback.
 */
export function validateInputFidelityForModel(
  model: KnownImageModel,
  inputFidelity: 'high' | 'low' | undefined,
): string | null {
  if (inputFidelity === undefined) return null
  if (MODEL_CAPABILITIES[model].inputFidelity) return null
  return `${model} does not support input_fidelity (it is always high)`
}
