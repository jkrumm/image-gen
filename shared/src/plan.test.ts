import { describe, expect, test } from 'bun:test'
import { planRequestSchema, promptFragmentSchema } from './plan.js'

describe('planRequestSchema', () => {
  test('accepts brief alone', () => {
    const result = planRequestSchema.safeParse({ brief: 'a lighthouse at dusk' })
    expect(result.success).toBe(true)
  })

  test('accepts current_prompt alone', () => {
    const result = planRequestSchema.safeParse({
      current_prompt: 'a lighthouse at dusk, oil painting',
    })
    expect(result.success).toBe(true)
  })

  test('accepts current_prompt with delta', () => {
    const result = planRequestSchema.safeParse({
      current_prompt: 'a lighthouse at dusk, oil painting',
      delta: 'make it winter',
    })
    expect(result.success).toBe(true)
  })

  test('rejects neither brief nor current_prompt', () => {
    const result = planRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  test('rejects both brief and current_prompt', () => {
    const result = planRequestSchema.safeParse({
      brief: 'a lighthouse',
      current_prompt: 'a lighthouse at dusk, oil painting',
    })
    expect(result.success).toBe(false)
  })

  test('rejects delta without current_prompt', () => {
    const result = planRequestSchema.safeParse({ brief: 'a lighthouse', delta: 'make it winter' })
    expect(result.success).toBe(false)
  })

  test('defaults mode, intent, and has_references', () => {
    const result = planRequestSchema.parse({ brief: 'a lighthouse at dusk' })
    expect(result.mode).toBe('auto')
    expect(result.intent).toBe('auto')
    expect(result.has_references).toBe(false)
  })
})

describe('promptFragmentSchema', () => {
  test('accepts a fragment at or under 40 words', () => {
    const fortyWords = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    expect(promptFragmentSchema.safeParse(fortyWords).success).toBe(true)
  })

  test('rejects a fragment over 40 words', () => {
    const fortyOneWords = Array.from({ length: 41 }, (_, i) => `word${i}`).join(' ')
    expect(promptFragmentSchema.safeParse(fortyOneWords).success).toBe(false)
  })
})
