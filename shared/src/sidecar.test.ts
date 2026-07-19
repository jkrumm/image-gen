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
        assumptions: [{ slot: 'lighting', text: 'golden hour' }],
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
  })

  test('rejects an invalid role', () => {
    const result = generationMetadataV2Schema.safeParse({
      ...baseGeneration,
      images: [{ filename: 'image-1.png', format: 'png', roles: ['not-a-role'] }],
    })
    expect(result.success).toBe(false)
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
