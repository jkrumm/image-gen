import { describe, expect, test } from 'bun:test'
import { routeModel, validateBackground, validateInputFidelity, validateSize } from './routing.js'

describe('routeModel', () => {
  test('auto resolves to gpt-image-2', () => {
    expect(routeModel({ model: 'auto' })).toEqual({ model: 'gpt-image-2', routed: false })
  })

  test('explicit gpt-image-2 is honored', () => {
    expect(routeModel({ model: 'gpt-image-2' })).toEqual({ model: 'gpt-image-2', routed: false })
  })

  /**
   * Was: "transparent + auto routes to gpt-image-1.5 with a reason". That
   * fallback is gone — generation is single-model, so nothing reroutes and a
   * transparent request is refused by `validateBackground` instead (see below).
   */
  test('routing never fires — there is no second generatable model', () => {
    for (const model of ['auto', 'gpt-image-2'] as const) {
      const result = routeModel({ model })
      expect(result.routed).toBe(false)
      expect(result.reason).toBeUndefined()
    }
  })
})

describe('validateBackground', () => {
  test('opaque and auto are always fine', () => {
    expect(validateBackground('gpt-image-2', 'opaque')).toBeNull()
    expect(validateBackground('gpt-image-2', 'auto')).toBeNull()
  })

  test('transparent is rejected, naming the model and the missing alpha channel', () => {
    const error = validateBackground('gpt-image-2', 'transparent')
    expect(error).toMatch(/gpt-image-2/)
    expect(error).toMatch(/alpha channel/)
  })
})

describe('validateSize', () => {
  test('gpt-image-2 accepts a preset', () => {
    expect(validateSize('gpt-image-2', '1024x1024')).toBeNull()
  })

  test('gpt-image-2 accepts a valid arbitrary size (2560x1440)', () => {
    expect(validateSize('gpt-image-2', '2560x1440')).toBeNull()
  })

  test('gpt-image-2 rejects a size not a multiple of 16', () => {
    expect(validateSize('gpt-image-2', '1000x1000')).toMatch(/multiples of 16/)
  })

  test('gpt-image-2 rejects an aspect ratio beyond 3:1', () => {
    expect(validateSize('gpt-image-2', '3200x256')).toMatch(/aspect ratio/)
  })

  test('gpt-image-2 rejects a pixel count below the minimum', () => {
    expect(validateSize('gpt-image-2', '256x256')).toMatch(/pixel count/)
  })

  test('gpt-image-2 rejects an edge above the max', () => {
    expect(validateSize('gpt-image-2', '3840x1024')).toMatch(/3839/)
  })
})

describe('validateInputFidelity', () => {
  test('undefined is always fine', () => {
    expect(validateInputFidelity('gpt-image-2', undefined)).toBeNull()
  })

  test('gpt-image-2 rejects input_fidelity outright', () => {
    expect(validateInputFidelity('gpt-image-2', 'high')).toMatch(/gpt-image-2 does not support/)
    expect(validateInputFidelity('gpt-image-2', 'low')).toMatch(/does not support/)
  })
})
