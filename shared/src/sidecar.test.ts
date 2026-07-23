import { describe, expect, test } from 'bun:test'
import {
  createDraftSchema,
  generationMetadataV2Schema,
  projectSchema,
  styleGuideSchema,
} from './sidecar.js'

const baseGeneration = {
  schema: 2,
  id: '2026-07-17_120000',
  created_at: '2026-07-17T12:00:00.000Z',
  prompt: 'a lighthouse at dusk, oil painting',
  requested_model: 'auto',
  model: 'gpt-image-2',
  routed: false,
  params: {
    size: '1024x1024',
    quality: 'high',
    background: 'opaque',
    output_format: 'png',
    n: 1,
    moderation: 'auto',
  },
  images: [{ filename: 'image-1.png', format: 'png' }],
  usage: { input_tokens: 10, output_tokens: 7024, total_tokens: 7034 },
  cost: { usd: 0.21, source: 'computed' },
  latency_ms: 4000,
}

describe('generationMetadataV2Schema', () => {
  test('parses a minimal schema-2 generation, defaulting kind/roles/starred/project_ids/style_guide_ids', () => {
    const result = generationMetadataV2Schema.parse(baseGeneration)
    expect(result.kind).toBe('generate')
    expect(result.images[0]?.roles).toEqual([])
    expect(result.images[0]?.starred).toBe(false)
    expect(result.project_ids).toEqual([])
    expect(result.style_guide_ids).toEqual([])
  })

  test('rejects schema: 1 (not this schema version)', () => {
    const result = generationMetadataV2Schema.safeParse({ ...baseGeneration, schema: 1 })
    expect(result.success).toBe(false)
  })

  // Every sidecar that actually exists on disk carries only a flat `parent_id` string, so the
  // migrated `parent` has an id and nothing else. Requiring `image`/`op` here would reject the
  // real data while accepting only the idealized concept-doc sample.
  test('accepts a parent with only an id (image/op unknown)', () => {
    const result = generationMetadataV2Schema.parse({
      ...baseGeneration,
      parent: { id: '2026-07-10_090000' },
    })
    expect(result.parent?.id).toBe('2026-07-10_090000')
    expect(result.parent?.image).toBeUndefined()
    expect(result.parent?.op).toBeUndefined()
  })

  test('accepts kind: import and a full parent/lineage record', () => {
    const result = generationMetadataV2Schema.parse({
      ...baseGeneration,
      kind: 'import',
      parent: { id: '2026-07-10_090000', image: 'image-1.png', op: 'edit' },
      project_ids: ['journal-2026'],
      style_guide_ids: ['acme-web'],
      style_fragment_used: 'sapphire and ochre, impasto texture',
      images: [{ filename: 'image-1.png', format: 'png', roles: ['final', 'icon'], starred: true }],
      moderation_outcome: { blocked: true, stage: 'output', categories: ['other'] },
      enhance: {
        brief: 'a lighthouse at dusk',
        intent: 'painterly',
        mode_applied: 'full',
        plan_prompt: 'a lighthouse at dusk, oil painting',
        final_prompt_edited: false,
        additions: [{ slot: 'lighting', text: 'golden hour' }],
        assumptions: ['assumed dusk mood', 'corrected "lighthouse" spelling'],
        warnings: [{ code: 'restraint_terms', severity: 'warn', action: 'dismissed' }],
        series_context_ids: ['2026-06-01_100000'],
        playbook_version: '1',
        enhance_model: 'gpt-5.6',
      },
    })
    expect(result.kind).toBe('import')
    expect(result.parent?.op).toBe('edit')
    expect(result.images[0]?.roles).toEqual(['final', 'icon'])
    expect(result.enhance?.intent).toBe('painterly')
    expect(result.enhance?.additions).toEqual([{ slot: 'lighting', text: 'golden hour' }])
    expect(result.enhance?.assumptions).toEqual([
      'assumed dusk mood',
      'corrected "lighthouse" spelling',
    ])
  })

  test('accepts an enhance record with no additions/assumptions (both default to [])', () => {
    const result = generationMetadataV2Schema.parse({
      ...baseGeneration,
      enhance: {
        brief: 'a lighthouse at dusk',
        intent: 'painterly',
        mode_applied: 'full',
        plan_prompt: 'a lighthouse at dusk, oil painting',
        final_prompt_edited: false,
        playbook_version: '1',
        enhance_model: 'gpt-5.6',
      },
    })
    expect(result.enhance?.additions).toEqual([])
    expect(result.enhance?.assumptions).toEqual([])
    expect(result.enhance?.warnings).toEqual([])
  })

  test('parses a generation with no enhance block at all (raw mode / no plan run)', () => {
    const result = generationMetadataV2Schema.parse(baseGeneration)
    expect(result.enhance).toBeUndefined()
  })

  test('rejects an invalid role', () => {
    const result = generationMetadataV2Schema.safeParse({
      ...baseGeneration,
      images: [{ filename: 'image-1.png', format: 'png', roles: ['not-a-role'] }],
    })
    expect(result.success).toBe(false)
  })

  // Regression coverage: retiring a model from generation (IMAGE_MODELS) must
  // never make it unparseable as historical data (KNOWN_IMAGE_MODELS) —
  // listGenerations() (app) silently skips sidecars that fail to parse, so a
  // dropped enum value here makes real library entries vanish from the UI.
  describe('retired-model regression coverage', () => {
    test('still parses a sidecar recorded against the retired gpt-image-1.5', () => {
      const result = generationMetadataV2Schema.parse({
        ...baseGeneration,
        requested_model: 'gpt-image-1.5',
        model: 'gpt-image-1.5',
      })
      expect(result.model).toBe('gpt-image-1.5')
      expect(result.requested_model).toBe('gpt-image-1.5')
    })

    test('still parses a sidecar recorded against the retired gpt-image-1-mini', () => {
      const result = generationMetadataV2Schema.parse({
        ...baseGeneration,
        requested_model: 'gpt-image-1-mini',
        model: 'gpt-image-1-mini',
      })
      expect(result.model).toBe('gpt-image-1-mini')
      expect(result.requested_model).toBe('gpt-image-1-mini')
    })

    test('still parses a requested_model of "auto" alongside a retired resolved model', () => {
      const result = generationMetadataV2Schema.parse({
        ...baseGeneration,
        requested_model: 'auto',
        model: 'gpt-image-1.5',
      })
      expect(result.requested_model).toBe('auto')
      expect(result.model).toBe('gpt-image-1.5')
    })

    test('still parses a sidecar with params.background: "transparent" (native alpha, gpt-image-1.5/-mini only)', () => {
      const result = generationMetadataV2Schema.parse({
        ...baseGeneration,
        model: 'gpt-image-1.5',
        requested_model: 'gpt-image-1.5',
        params: { ...baseGeneration.params, background: 'transparent' },
      })
      expect(result.params.background).toBe('transparent')
    })

    test('rejects a model value that was never real (typo / not in KNOWN_IMAGE_MODELS)', () => {
      const result = generationMetadataV2Schema.safeParse({
        ...baseGeneration,
        model: 'gpt-image-3-does-not-exist',
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('projectSchema', () => {
  test('parses a minimal project, defaulting notes and anchor_ids', () => {
    const result = projectSchema.parse({ slug: 'journal-2026', name: 'Journal 2026' })
    expect(result.notes).toBe('')
    expect(result.anchor_ids).toEqual([])
  })
})

describe('styleGuideSchema', () => {
  test('parses a minimal style guide with a verbatim hex palette', () => {
    const result = styleGuideSchema.parse({
      slug: 'acme-web',
      name: 'Acme Web',
      palette: [{ hex: '#1A2B3C', role: 'primary' }],
      prompt_fragment: 'confident geometric sans, sapphire and slate, minimal editorial layout',
    })
    expect(result.palette[0]?.hex).toBe('#1A2B3C')
  })

  test('rejects a malformed hex', () => {
    const result = styleGuideSchema.safeParse({
      slug: 'acme-web',
      name: 'Acme Web',
      palette: [{ hex: 'blue', role: 'primary' }],
      prompt_fragment: 'confident geometric sans',
    })
    expect(result.success).toBe(false)
  })
})

describe('createDraftSchema', () => {
  test('parses a minimal draft, defaulting reference_paths and style_guide_ids', () => {
    const result = createDraftSchema.parse({ brief: 'a lighthouse at dusk' })
    expect(result.reference_paths).toEqual([])
    expect(result.style_guide_ids).toEqual([])
  })
})
