import { describe, expect, test } from 'bun:test'
import {
  editRequestSchema,
  generateRequestSchema,
  KNOWN_IMAGE_MODELS,
  LEGACY_REQUEST_MODELS,
} from './contract.js'

describe('generateRequestSchema — model retirement', () => {
  test('accepts both generatable models', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
      const result = generateRequestSchema.safeParse({
        prompt: 'a lighthouse at dusk',
        model,
      })
      expect(result.success).toBe(true)
    }
  })

  test('accepts "auto"', () => {
    const result = generateRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'auto',
    })
    expect(result.success).toBe(true)
  })

  // gpt-image-2 is retired from generation, but stays *accepted on the request schema* — a narrow
  // deploy-compat shim (`LEGACY_REQUEST_MODELS`) for an app build predating 2026-09-23 that still
  // sends it explicitly. See rules.test.ts for the routing behavior this then triggers.
  test('accepts the legacy gpt-image-2 (deploy-compat shim), unlike other retired models', () => {
    const result = generateRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'gpt-image-2',
    })
    expect(result.success).toBe(true)
    expect(LEGACY_REQUEST_MODELS).toEqual(['gpt-image-2'])
  })

  // Regression: a model retired from generation must be rejected on new
  // requests even though it remains a valid, parseable value for historical
  // sidecars (see sidecar.test.ts's "retired-model regression coverage").
  // gpt-image-1.5/-1-mini get no such compat shim — only gpt-image-2 (the
  // era's DEFAULT_MODEL, so the only id an old app build actually sends).
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

  test('accepts the legacy gpt-image-2 on the edit path too (same deploy-compat shim)', () => {
    const result = editRequestSchema.safeParse({
      prompt: 'a lighthouse at dusk',
      model: 'gpt-image-2',
    })
    expect(result.success).toBe(true)
  })
})

describe('KNOWN_IMAGE_MODELS', () => {
  test('still lists every model that may appear in historical data, including retired ones', () => {
    expect(KNOWN_IMAGE_MODELS).toContain('gpt-image-2')
    expect(KNOWN_IMAGE_MODELS).toContain('gpt-image-1.5')
    expect(KNOWN_IMAGE_MODELS).toContain('gpt-image-1-mini')
  })
})
