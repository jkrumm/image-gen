import { describe, expect, test } from 'bun:test'
import { routeModel, validateInputFidelity, validateSize } from './routing.js'

describe('routeModel', () => {
  test('auto resolves to gpt-image-2', () => {
    expect(routeModel({ model: 'auto', background: 'auto' })).toEqual({
      model: 'gpt-image-2',
      routed: false,
    })
  })

  test('transparent + auto routes to gpt-image-1.5 with a reason', () => {
    const result = routeModel({ model: 'auto', background: 'transparent' })
    expect(result.model).toBe('gpt-image-1.5')
    expect(result.routed).toBe(true)
    expect(result.reason).toBeTruthy()
  })

  test('transparent + gpt-image-2 routes to gpt-image-1.5', () => {
    const result = routeModel({ model: 'gpt-image-2', background: 'transparent' })
    expect(result.model).toBe('gpt-image-1.5')
    expect(result.routed).toBe(true)
  })

  test('transparent + gpt-image-1-mini stays on mini', () => {
    const result = routeModel({ model: 'gpt-image-1-mini', background: 'transparent' })
    expect(result).toEqual({ model: 'gpt-image-1-mini', routed: false })
  })

  test('explicit gpt-image-1.5 without transparency is honored', () => {
    const result = routeModel({ model: 'gpt-image-1.5', background: 'opaque' })
    expect(result).toEqual({ model: 'gpt-image-1.5', routed: false })
  })

  test('transparent + gpt-image-1.5 does not route (already supports transparency)', () => {
    const result = routeModel({ model: 'gpt-image-1.5', background: 'transparent' })
    expect(result).toEqual({ model: 'gpt-image-1.5', routed: false })
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

  test('gpt-image-1.5 accepts only presets', () => {
    expect(validateSize('gpt-image-1.5', '1024x1024')).toBeNull()
    expect(validateSize('gpt-image-1.5', '2560x1440')).toMatch(/only supports/)
  })

  test('gpt-image-1-mini accepts only presets', () => {
    expect(validateSize('gpt-image-1-mini', '1536x1024')).toBeNull()
    expect(validateSize('gpt-image-1-mini', '800x600')).toMatch(/only supports/)
  })
})

describe('validateInputFidelity', () => {
  test('undefined is always fine', () => {
    expect(validateInputFidelity('gpt-image-2', undefined)).toBeNull()
    expect(validateInputFidelity('gpt-image-1.5', undefined)).toBeNull()
  })

  test('gpt-image-2 rejects input_fidelity outright', () => {
    expect(validateInputFidelity('gpt-image-2', 'high')).toMatch(/gpt-image-2 does not support/)
    expect(validateInputFidelity('gpt-image-2', 'low')).toMatch(/does not support/)
  })

  test('gpt-image-1.5 accepts input_fidelity', () => {
    expect(validateInputFidelity('gpt-image-1.5', 'high')).toBeNull()
    expect(validateInputFidelity('gpt-image-1.5', 'low')).toBeNull()
  })

  test('gpt-image-1-mini rejects input_fidelity', () => {
    expect(validateInputFidelity('gpt-image-1-mini', 'high')).toMatch(/does not support/)
  })
})
