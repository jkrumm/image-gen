import {
  DEFAULT_MODEL,
  GPT_IMAGE_2_SIZE,
  MODEL_CAPABILITIES,
  SIZE_PRESETS,
  TRANSPARENCY_MODEL,
  type ImageModel,
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
 * default model; a transparent background then forces TRANSPARENCY_MODEL, since
 * gpt-image-2 hard-400s on transparency (permanent — verified by live probe).
 *
 * Capability-driven rather than hardcoded to a model id: adding a model with
 * different capabilities must not require touching this function.
 */
export function resolveModel(req: {
  model: ImageModel | 'auto'
  background: 'transparent' | 'opaque' | 'auto'
}): ImageModel {
  const base: ImageModel = req.model === 'auto' ? DEFAULT_MODEL : req.model

  if (req.background === 'transparent' && !MODEL_CAPABILITIES[base].transparentBackground) {
    return TRANSPARENCY_MODEL
  }
  return base
}

/** Why a request was rerouted, for surfacing to the user. Null when not rerouted. */
export function routingReason(req: {
  model: ImageModel | 'auto'
  background: 'transparent' | 'opaque' | 'auto'
}): string | null {
  const base: ImageModel = req.model === 'auto' ? DEFAULT_MODEL : req.model
  const resolved = resolveModel(req)
  if (resolved === base) return null
  return `${base} does not support transparent backgrounds`
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

/**
 * `input_fidelity` is edits-only, and gpt-image-2 rejects it outright ("does not
 * support the 'input_fidelity' parameter") because it is locked to high fidelity
 * internally. We refuse rather than silently drop it — dropping a setting the
 * caller explicitly asked for is worse than a clear error.
 */
export function validateInputFidelityForModel(
  model: ImageModel,
  inputFidelity: 'high' | 'low' | undefined,
): string | null {
  if (inputFidelity === undefined) return null
  if (MODEL_CAPABILITIES[model].inputFidelity) return null
  return `${model} does not support input_fidelity (it is always high); use ${TRANSPARENCY_MODEL} to control fidelity`
}
