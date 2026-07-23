/**
 * `listGenerations()` silently skips sidecars that fail `safeParse` (see `library.ts`) — a
 * non-additive schema change would make a user's entire library vanish rather than error. This
 * pins the one change this file makes: adding `derivatives` must not break a sidecar written
 * before that field existed.
 */
import { describe, expect, test } from 'bun:test'
import { generationMetadataSchema, migrateGenerationMetadata } from './metadata'

const PRE_REFINE_SIDECAR = {
  schema: 2,
  id: '2026-01-01_00-00-00_abcd',
  created_at: '2026-01-01T00:00:00.000Z',
  kind: 'generate',
  prompt: 'a red fox',
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
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  cost: { usd: 0.01, source: 'computed' },
  latency_ms: 1200,
}

describe('generationMetadataSchema', () => {
  test('a sidecar with no derivatives key still parses (pre-Refine library entries)', () => {
    const parsed = generationMetadataSchema.safeParse(PRE_REFINE_SIDECAR)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.derivatives).toBeUndefined()
  })

  test('a sidecar with derivatives parses them', () => {
    const withDerivatives = {
      ...PRE_REFINE_SIDECAR,
      derivatives: [
        {
          filename: 'favicon-32.png',
          label: 'Favicon 32',
          width: 32,
          height: 32,
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    }
    const parsed = generationMetadataSchema.safeParse(withDerivatives)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.derivatives).toHaveLength(1)
  })

  test('a derivative with no recipe key still parses (every real derivative on disk today)', () => {
    const withDerivatives = {
      ...PRE_REFINE_SIDECAR,
      derivatives: [
        {
          filename: 'icon.iconset/icon_16x16.png',
          label: 'icon_16x16',
          width: 16,
          height: 16,
          createdAt: '2026-07-17T05:54:10.550Z',
        },
      ],
    }
    const parsed = generationMetadataSchema.safeParse(withDerivatives)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.derivatives?.[0]?.recipe).toBeUndefined()
  })

  test('a sidecar with a full enhance record (additions + free-text assumptions) parses', () => {
    const withEnhance = {
      ...PRE_REFINE_SIDECAR,
      enhance: {
        brief: 'a red fox in the snow',
        intent: 'painterly',
        mode_applied: 'full',
        plan_prompt: 'a red fox in the snow, oil painting',
        final_prompt_edited: true,
        additions: [{ slot: 'medium', text: 'oil painting' }],
        assumptions: ['assumed a winter setting'],
        warnings: [{ code: 'restraint_terms', severity: 'warn', action: 'accepted' }],
        series_context_ids: [],
        playbook_version: '1',
        enhance_model: 'gpt-5.6',
      },
    }
    const parsed = generationMetadataSchema.safeParse(withEnhance)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.enhance?.additions).toEqual([{ slot: 'medium', text: 'oil painting' }])
    expect(parsed.data.enhance?.assumptions).toEqual(['assumed a winter setting'])
    expect(parsed.data.enhance?.enhance_model).toBe('gpt-5.6')
  })

  test('a derivative with a stored recipe parses it, for "Refine again"', () => {
    const withDerivatives = {
      ...PRE_REFINE_SIDECAR,
      derivatives: [
        {
          filename: 'image-1024.png',
          label: 'PNG 1024',
          width: 1024,
          height: 1024,
          createdAt: '2026-01-02T00:00:00.000Z',
          recipe: { v: 1, transform: { scale: 1.55, offsetX: 0, offsetY: 0 } },
        },
      ],
    }
    const parsed = generationMetadataSchema.safeParse(withDerivatives)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.derivatives?.[0]?.recipe?.transform.scale).toBe(1.55)
  })
})

/**
 * Legacy (schema-1) sidecars — no `schema` key at all. These three fixtures are the exact,
 * verbatim key sets observed probing all 5 real sidecars under `~/Pictures/ImageGen/*​/metadata.json`
 * this session (oldest → newest); they are NOT read from disk here, only reproduced literally, so
 * this pins the migration against real historical shapes rather than an idealized one.
 *
 * `listGenerations()` silently skips sidecars that fail `safeParse` — a migration bug here does
 * not throw, it makes a user's existing library silently vanish from the UI. Every fixture below
 * must migrate successfully, preserve every extra field, and never fall onto the skip path.
 */

const LEGACY_PARAMS = {
  size: '1024x1024',
  quality: 'high',
  background: 'opaque',
  output_format: 'png',
  n: 1,
  moderation: 'auto',
}

/** Oldest key set: id,created_at,prompt,requested_model,model,routed,routing_reason,params,images,usage,cost,latency_ms */
const LEGACY_SIDECAR_OLDEST = {
  id: '2026-01-01_00-00-00_aaaa',
  created_at: '2026-01-01T00:00:00.000Z',
  prompt: 'a red fox in the snow',
  requested_model: 'auto',
  model: 'gpt-image-2',
  routed: true,
  routing_reason: 'transparent background requested',
  params: LEGACY_PARAMS,
  images: [{ filename: 'image-1.png', format: 'png' }],
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  cost: { usd: 0.01, source: 'computed' },
  latency_ms: 1200,
}

/** Middle key set: id,created_at,kind,prompt,requested_model,model,routed,params,images,derivatives,usage,cost,latency_ms */
const LEGACY_SIDECAR_MIDDLE = {
  id: '2026-03-01_00-00-00_bbbb',
  created_at: '2026-03-01T00:00:00.000Z',
  kind: 'generate',
  prompt: 'a lighthouse at dusk',
  requested_model: 'gpt-image-2',
  model: 'gpt-image-2',
  routed: false,
  params: LEGACY_PARAMS,
  images: [{ filename: 'image-1.png', format: 'png' }],
  derivatives: [
    {
      filename: 'favicon-32.png',
      label: 'Favicon 32',
      width: 32,
      height: 32,
      createdAt: '2026-03-02T00:00:00.000Z',
    },
  ],
  usage: { input_tokens: 12, output_tokens: 196, total_tokens: 208 },
  cost: { usd: 0.006, source: 'computed' },
  latency_ms: 900,
}

/** Newest key set: id,created_at,kind,prompt,requested_model,model,routed,params,images,input_images,mask,usage,cost,latency_ms,parent_id */
const LEGACY_SIDECAR_NEWEST = {
  id: '2026-07-01_00-00-00_cccc',
  created_at: '2026-07-01T00:00:00.000Z',
  kind: 'edit',
  prompt: 'add a lighthouse beam',
  requested_model: 'auto',
  model: 'gpt-image-2',
  routed: false,
  params: LEGACY_PARAMS,
  images: [{ filename: 'image-1.png', format: 'png' }],
  input_images: [{ filename: 'input-1.png', format: 'png' }],
  mask: { filename: 'mask.png', format: 'png' },
  usage: { input_tokens: 30, output_tokens: 7024, total_tokens: 7054 },
  cost: { usd: 0.211, source: 'computed' },
  latency_ms: 4100,
  parent_id: '2026-06-15_00-00-00_dddd',
}

describe('migrateGenerationMetadata', () => {
  test('the oldest key set migrates and parses: routed/routing_reason survive, kind defaults', () => {
    const migrated = migrateGenerationMetadata(LEGACY_SIDECAR_OLDEST)
    const parsed = generationMetadataSchema.safeParse(migrated)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.kind).toBe('generate')
    expect(parsed.data.routed).toBe(true)
    expect(parsed.data.routing_reason).toBe('transparent background requested')
    expect(parsed.data.images[0]?.roles).toEqual([])
    expect(parsed.data.images[0]?.starred).toBe(false)
    expect(parsed.data.project_ids).toEqual([])
    expect(parsed.data.style_guide_ids).toEqual([])
    expect(parsed.data.parent).toBeUndefined()
  })

  test('the middle key set migrates and parses: derivatives survive', () => {
    const migrated = migrateGenerationMetadata(LEGACY_SIDECAR_MIDDLE)
    const parsed = generationMetadataSchema.safeParse(migrated)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.derivatives).toHaveLength(1)
    expect(parsed.data.derivatives?.[0]?.filename).toBe('favicon-32.png')
  })

  test('the newest key set migrates and parses: input_images/mask survive, parent_id becomes parent with op: edit', () => {
    const migrated = migrateGenerationMetadata(LEGACY_SIDECAR_NEWEST)
    const parsed = generationMetadataSchema.safeParse(migrated)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.input_images).toEqual([{ filename: 'input-1.png', format: 'png' }])
    expect(parsed.data.mask).toEqual({ filename: 'mask.png', format: 'png' })
    expect(parsed.data.parent).toEqual({ id: '2026-06-15_00-00-00_dddd', op: 'edit' })
  })

  test('the load-bearing hazard: without migration, a legacy sidecar fails safeParse and would vanish from the library', () => {
    const withoutMigration = generationMetadataSchema.safeParse(LEGACY_SIDECAR_OLDEST)
    expect(withoutMigration.success).toBe(false)
  })

  test('a legacy sidecar (no enhance block at all) migrates and parses with enhance undefined', () => {
    const migrated = migrateGenerationMetadata(LEGACY_SIDECAR_OLDEST)
    const parsed = generationMetadataSchema.safeParse(migrated)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.enhance).toBeUndefined()
  })

  test('an already-migrated (schema: 2) sidecar passes through untouched', () => {
    const alreadyV2 = { ...LEGACY_SIDECAR_MIDDLE, schema: 2 as const }
    expect(migrateGenerationMetadata(alreadyV2)).toBe(alreadyV2)
  })

  test('a parent_id present on a non-edit kind omits op rather than guessing it', () => {
    const migrated = migrateGenerationMetadata({
      ...LEGACY_SIDECAR_MIDDLE,
      parent_id: '2026-02-15_00-00-00_eeee',
    })
    const parsed = generationMetadataSchema.safeParse(migrated)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.parent).toEqual({ id: '2026-02-15_00-00-00_eeee' })
  })

  test('a sidecar with neither schema nor parent_id gets schema: 2 and no parent', () => {
    const migrated = migrateGenerationMetadata(LEGACY_SIDECAR_MIDDLE) as Record<string, unknown>
    expect(migrated.schema).toBe(2)
    expect(migrated.parent).toBeUndefined()
  })

  test('non-object input passes through unchanged', () => {
    expect(migrateGenerationMetadata(null)).toBeNull()
    expect(migrateGenerationMetadata('not an object')).toBe('not an object')
  })
})
