import {
  resolveModel,
  routingReason,
  validateBackgroundForModel,
  validateInputFidelityForModel,
  validateSizeForModel,
  type EditRequest,
  type GenerateRequest,
  type ImageModel,
} from '@image-gen/shared'

export interface RouteResult {
  model: ImageModel
  routed: boolean
  reason?: string
}

/**
 * Pick the model that actually serves the request.
 *
 * Generation is now single-model, so this always resolves to gpt-image-2 and
 * `routed` is always false. The field survives because the response contract
 * still declares `routed`/`routing_reason` (see `contract.ts`) and clients read
 * them; it is reported honestly rather than removed. `routingReason` is still
 * consulted rather than hardcoded to `false` so that if a second generatable
 * model ever returns, this stays correct without an edit here.
 */
export function routeModel(req: { model: GenerateRequest['model'] }): RouteResult {
  const model = resolveModel(req)
  const reason = routingReason(req)
  if (reason === null) return { model, routed: false }
  return { model, routed: true, reason }
}

/**
 * Validate a requested size against a model's constraints. Delegates to the
 * shared rule — kept as a named export so routes don't reach past this
 * module's interface into `@image-gen/shared` directly.
 */
export function validateSize(model: ImageModel, size: string): string | null {
  return validateSizeForModel(model, size)
}

/**
 * Validate `background` against a model's alpha-channel support. gpt-image-2
 * hard-400s on `transparent` upstream and there is no longer a model to
 * reroute to, so the request is refused here with an actionable message rather
 * than silently downgraded to opaque or bounced off upstream as a 502.
 */
export function validateBackground(
  model: ImageModel,
  background: GenerateRequest['background'],
): string | null {
  return validateBackgroundForModel(model, background)
}

/**
 * Validate `input_fidelity` against a model's capabilities. Delegates to the
 * shared rule; see `validateSize` for why this thin wrapper exists.
 */
export function validateInputFidelity(
  model: ImageModel,
  inputFidelity: EditRequest['input_fidelity'],
): string | null {
  return validateInputFidelityForModel(model, inputFidelity)
}
