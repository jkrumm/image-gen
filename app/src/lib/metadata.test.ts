/**
 * `listGenerations()` silently skips sidecars that fail `safeParse` (see `library.ts`) — a
 * non-additive schema change would make a user's entire library vanish rather than error. This
 * pins the one change this file makes: adding `derivatives` must not break a sidecar written
 * before that field existed.
 */
import { describe, expect, test } from 'bun:test'
import { generationMetadataSchema } from './metadata'

const PRE_REFINE_SIDECAR = {
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
