import {
  DEFAULT_MODEL,
  GPT_IMAGE_2_SIZE,
  IMAGE_MODELS,
  MODEL_CAPABILITIES,
  SIZE_PRESETS,
  type ImageModel,
  type KnownImageModel,
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

/**
 * Resolve the model that will actually serve a request. `auto` becomes the
 * default (and only) generatable model.
 *
 * Previously rerouted a transparent-background request to a model with an
 * alpha channel when the base model lacked one. Generation is now
 * gpt-image-2-only, so there is no fallback target left to reroute to — a
 * transparent-background request is rejected outright by
 * `validateBackgroundForModel` instead of silently routed elsewhere.
 */
export function resolveModel(req: { model: ImageModel | 'auto' }): ImageModel {
  return req.model === 'auto' ? DEFAULT_MODEL : req.model
}

/**
 * Why a request was rerouted, for surfacing to the user. Always null now:
 * with a single generatable model there is nothing left to reroute to (see
 * `resolveModel`). Kept for interface stability with existing callers.
 */
export function routingReason(_req: { model: ImageModel | 'auto' }): string | null {
  return null
}

/**
 * `background: "transparent"` needs an alpha channel. gpt-image-2 — the only
 * generatable model — hard-400s on it (permanent, live-probed), and there is
 * no other generatable model left to fall back to, so this rejects outright
 * rather than rerouting.
 */
export function validateBackgroundForModel(
  model: ImageModel,
  background: 'transparent' | 'opaque' | 'auto',
): string | null {
  if (background !== 'transparent') return null
  if (MODEL_CAPABILITIES[model].transparentBackground) return null
  return `${model} has no alpha channel and cannot generate a transparent background`
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
export function validateSizeForModel(model: ImageModel, size: string): string | null {
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
 * recorded against gpt-image-1.5 replays on gpt-image-2 today, since that is
 * the only model left that can generate, so the size returned must be valid
 * for gpt-image-2, not for the legacy model the sidecar names.
 *
 * Exists because gpt-image-2 returns non-16-divisible dimensions for
 * `size: "auto"` (observed live: a 1024x1024 reference image produced a
 * 1254x1254 output). The gateway records that dimension truthfully into the
 * sidecar's `params.size`, but a truthful `params.size` is not necessarily a
 * *replayable* one — re-sending "1254x1254" 400s upstream ("width and height
 * must be divisible by 16") and fails `validateSizeForModel` locally too. Every
 * path that turns a recorded size back into a request (replay, re-edit, "use as
 * seed") must snap it back into validity first.
 *
 * `'auto'`, exact presets, and anything `validateSizeForModel` already accepts
 * for the resolved generatable model are returned unchanged. A `WxH` on a
 * presets-only generatable model folds to the closest-aspect-ratio preset —
 * unreachable today since gpt-image-2 accepts custom sizes, but kept generic
 * for when a presets-only model is generatable again. A `WxH` on gpt-image-2
 * is snapped into the GPT_IMAGE_2_SIZE envelope. Unparseable input falls back
 * to `'auto'` rather than throwing.
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
  model: ImageModel,
  inputFidelity: 'high' | 'low' | undefined,
): string | null {
  if (inputFidelity === undefined) return null
  if (MODEL_CAPABILITIES[model].inputFidelity) return null
  return `${model} does not support input_fidelity (it is always high)`
}
