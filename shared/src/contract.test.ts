import { describe, expect, test } from 'bun:test'
import { editRequestSchema, generateRequestSchema, KNOWN_IMAGE_MODELS } from './contract.js'

describe('generateRequestSchema — model retirement', () => {
  test('accepts the sole generatable model', () => {
    const result = generateRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'gpt-image-2',
    })
    expect(result.success).toBe(true)
  })

  test('accepts "auto"', () => {
    const result = generateRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'auto',
    })
    expect(result.success).toBe(true)
  })

  // Regression: a model retired from generation must be rejected on new
  // requests even though it remains a valid, parseable value for historical
  // sidecars (see sidecar.test.ts's "retired-model regression coverage").
  test('rejects the retired gpt-image-1.5 — no longer generatable', () => {
    const result = generateRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'gpt-image-1.5',
    })
    expect(result.success).toBe(false)
  })

  test('rejects the retired gpt-image-1-mini — no longer generatable', () => {
    const result = generateRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'gpt-image-1-mini',
    })
    expect(result.success).toBe(false)
  })
})

describe('editRequestSchema — model retirement', () => {
  test('rejects the retired gpt-image-1.5 on the edit path too (same commonImageFields.model)', () => {
    const result = editRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'gpt-image-1.5',
    })
    expect(result.success).toBe(false)
  })
})

describe('KNOWN_IMAGE_MODELS', () => {
  test('still lists every model that may appear in historical data, including retired ones', () => {
    expect(KNOWN_IMAGE_MODELS).toContain('gpt-image-2')
    expect(KNOWN_IMAGE_MODELS).toContain('gpt-image-1.5')
    expect(KNOWN_IMAGE_MODELS).toContain('gpt-image-1-mini')
  })
})
