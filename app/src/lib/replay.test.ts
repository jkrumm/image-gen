import { describe, expect, test } from 'bun:test'
import { generateRequestSchema, validateSizeForModel } from '@image-gen/shared'
import {
  buildPromoteRequest,
  buildRerunRequest,
  buildTweakRequest,
  describeCoercions,
  requestFromMetadata,
  snappedReplayRequest,
} from './replay'
import { generationMetadataSchema, type GenerationMetadataInput } from './metadata'

function makeEntry(overrides: Partial<GenerationMetadataInput>) {
  return generationMetadataSchema.parse({
    schema: 2,
    id: '2026-01-01_00-00-00_0000',
    created_at: '2026-01-01T00:00:00.000Z',
    kind: 'generate',
    prompt: 'a lighthouse at dusk, oil painting',
    requested_model: 'auto',
    model: 'gpt-image-2',
    routed: false,
    params: {
      size: '1024x1024',
      quality: 'high',
      background: 'opaque',
      output_format: 'png' as const,
      n: 1,
      moderation: 'auto' as const,
    },
    images: [{ filename: 'image-1.png', format: 'png' }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    cost: { usd: 0.01, source: 'computed' },
    latency_ms: 1000,
    ...overrides,
  } satisfies GenerationMetadataInput)
}

/** A generation recorded before the studio went gpt-image-2-only: a retired model, a transparent
 * background, and an `input_fidelity` — all three of which gpt-image-2 rejects today. */
function makeLegacyEntry(overrides: Partial<GenerationMetadataInput> = {}) {
  return makeEntry({
    kind: 'edit',
    model: 'gpt-image-1.5',
    requested_model: 'gpt-image-1.5',
    params: {
      ...makeEntry({}).params,
      background: 'transparent',
      input_fidelity: 'high',
    },
    ...overrides,
  })
}

describe('requestFromMetadata', () => {
  test('reconstructs the request bag verbatim, with no size snapping and no coercion', () => {
    const entry = makeEntry({ params: { ...makeEntry({}).params, size: '1254x1254' } })
    const request = requestFromMetadata(entry)
    expect(request.size).toBe('1254x1254')
    expect(request.prompt).toBe('a lighthouse at dusk, oil painting')
    expect(request.model).toBe('gpt-image-2')
  })

  test('reports a retired model verbatim — coercion belongs to the replay builders, not here', () => {
    expect(requestFromMetadata(makeLegacyEntry()).model).toBe('gpt-image-1.5')
    expect(requestFromMetadata(makeLegacyEntry()).background).toBe('transparent')
  })

  test('carries input_fidelity through when the sidecar recorded one', () => {
    const entry = makeEntry({
      model: 'gpt-image-1.5',
      params: { ...makeEntry({}).params, input_fidelity: 'high' },
    })
    expect(requestFromMetadata(entry).input_fidelity).toBe('high')
  })

  test('omits input_fidelity when the sidecar never recorded one', () => {
    expect(requestFromMetadata(makeEntry({})).input_fidelity).toBeUndefined()
  })
})

describe('replaying a legacy generation onto the only generatable model', () => {
  test('a retired model is replaced by gpt-image-2, and the change is reported', () => {
    const { request, coercions } = snappedReplayRequest(makeLegacyEntry())
    expect(request.model).toBe('gpt-image-2')
    expect(coercions).toContainEqual(
      expect.objectContaining({ field: 'model', from: 'gpt-image-1.5', to: 'gpt-image-2' }),
    )
  })

  test('a transparent background becomes opaque, and the change is reported', () => {
    const { request, coercions } = snappedReplayRequest(makeLegacyEntry())
    expect(request.background).toBe('opaque')
    expect(coercions).toContainEqual(
      expect.objectContaining({ field: 'background', from: 'transparent', to: 'opaque' }),
    )
  })

  test('input_fidelity is dropped entirely, and the change is reported', () => {
    const { request, coercions } = snappedReplayRequest(makeLegacyEntry())
    expect(request).not.toHaveProperty('input_fidelity')
    expect(coercions).toContainEqual(expect.objectContaining({ field: 'input_fidelity' }))
  })

  test('the resulting request is accepted by the generate contract and the size rules', () => {
    // The end-to-end guarantee: a gpt-image-1.5 generation recorded with a transparent
    // background, an input_fidelity, and an unreplayable size still produces a request the
    // gateway will take.
    const legacy = makeLegacyEntry({
      params: {
        ...makeEntry({}).params,
        background: 'transparent',
        input_fidelity: 'high',
        size: '1254x1254',
      },
    })
    const { request } = buildRerunRequest(legacy)
    const parsed = generateRequestSchema.parse(request)
    expect(parsed.model).toBe('gpt-image-2')
    expect(parsed.background).toBe('opaque')
    expect(validateSizeForModel('gpt-image-2', parsed.size)).toBeNull()
    expect(parsed.prompt).toBe(legacy.prompt)
  })

  test('a modern gpt-image-2 generation needs no coercion at all', () => {
    expect(snappedReplayRequest(makeEntry({})).coercions).toEqual([])
  })

  test('describeCoercions renders every change into one human-readable line', () => {
    const { coercions } = snappedReplayRequest(makeLegacyEntry())
    const described = describeCoercions(coercions)
    expect(described).toContain('gpt-image-1.5')
    expect(described).toContain('transparent')
    expect(described).toContain('input_fidelity')
  })
})

describe('the replay hazard — snapping a recorded but unreplayable size', () => {
  test('a non-16-divisible recorded size (gpt-image-2 auto output) is snapped into validity', () => {
    // Observed live: a 1024x1024 reference produced a 1254x1254 output on gpt-image-2.
    const entry = makeEntry({ params: { ...makeEntry({}).params, size: '1254x1254' } })
    const { request, coercions } = buildRerunRequest(entry)
    expect(request.size).not.toBe('1254x1254')
    expect(validateSizeForModel('gpt-image-2', request.size ?? 'auto')).toBeNull()
    expect(coercions).toContainEqual(expect.objectContaining({ field: 'size', from: '1254x1254' }))
  })

  test('an already-valid recorded size passes through unchanged, with no size coercion', () => {
    const entry = makeEntry({ params: { ...makeEntry({}).params, size: '1536x1024' } })
    const { request, coercions } = buildRerunRequest(entry)
    expect(request.size).toBe('1536x1024')
    expect(coercions.filter((coercion) => coercion.field === 'size')).toEqual([])
  })

  test('a legacy preset size stays put — it is valid on gpt-image-2 too', () => {
    // Retired models were presets-only; every preset is still a legal gpt-image-2 size, so
    // replaying one changes the model but never the size.
    const entry = makeEntry({
      model: 'gpt-image-1.5',
      params: { ...makeEntry({}).params, size: '1536x1024' },
    })
    expect(buildPromoteRequest(entry).request.size).toBe('1536x1024')
  })

  test('a legacy custom size is snapped into the gpt-image-2 envelope, not folded to a preset', () => {
    // gpt-image-2 accepts arbitrary WxH, so replay keeps the recorded shape rather than
    // collapsing it onto a preset the way a presets-only target would have required.
    const entry = makeEntry({
      model: 'gpt-image-1.5',
      params: { ...makeEntry({}).params, size: '1254x1254' },
    })
    const size = buildTweakRequest(entry).request.size ?? 'auto'
    expect(validateSizeForModel('gpt-image-2', size)).toBeNull()
    expect(size).toMatch(/^\d+x\d+$/)
  })
})

describe('buildRerunRequest', () => {
  test('resubmits verbatim (prompt/quality/n unchanged) and records parent op: rerun', () => {
    const entry = makeEntry({ params: { ...makeEntry({}).params, quality: 'low', n: 4 } })
    const { request } = buildRerunRequest(entry)
    expect(request.prompt).toBe(entry.prompt)
    expect(request.quality).toBe('low')
    expect(request.n).toBe(4)
    expect(request.parent).toEqual({ id: entry.id, op: 'rerun' })
  })
})

describe('buildPromoteRequest', () => {
  test('forces quality: high and n: 1 regardless of the recorded settings, and records parent op: promote', () => {
    const entry = makeEntry({ params: { ...makeEntry({}).params, quality: 'low', n: 6 } })
    const { request } = buildPromoteRequest(entry)
    expect(request.quality).toBe('high')
    expect(request.n).toBe(1)
    expect(request.parent).toEqual({ id: entry.id, op: 'promote' })
  })

  test('leaves prompt and every other replayable field untouched', () => {
    const entry = makeEntry({})
    const { request } = buildPromoteRequest(entry)
    expect(request.prompt).toBe(entry.prompt)
    expect(request.model).toBe(entry.model)
    expect(request.background).toBe(entry.params.background)
  })
})

describe('buildTweakRequest', () => {
  test('carries no parent — Tweak records parent separately, via the seed it navigates with', () => {
    const { request } = buildTweakRequest(makeEntry({}))
    expect(request).not.toHaveProperty('parent')
  })

  test('still snaps the size — Tweak is a replay path too', () => {
    const entry = makeEntry({ params: { ...makeEntry({}).params, size: '1254x1254' } })
    expect(buildTweakRequest(entry).request.size).not.toBe('1254x1254')
  })
})
