import {
  resolveModel,
  routingReason,
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
 * Pick the model that actually serves the request. Thin wrapper over the
 * shared `resolveModel`/`routingReason` — kept as its own function (rather
 * than inlining the two shared calls at each call site) so the gateway's
 * `RouteResult` shape stays a single source of truth for routes and tests.
 */
export function routeModel(req: {
  model: GenerateRequest['model']
  background: GenerateRequest['background']
}): RouteResult {
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
 * Validate `input_fidelity` against a model's capabilities. Delegates to the
 * shared rule; see `validateSize` for why this thin wrapper exists.
 */
export function validateInputFidelity(
  model: ImageModel,
  inputFidelity: EditRequest['input_fidelity'],
): string | null {
  return validateInputFidelityForModel(model, inputFidelity)
}
