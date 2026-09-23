import { describe, expect, test } from 'bun:test'
import {
  routeModel,
  validateBackground,
  validateInputFidelity,
  validateQuality,
  validateSize,
  validateTransparentFormat,
} from './routing.js'

describe('routeModel', () => {
  test('auto + generate at a draft quality routes to flare', () => {
    expect(routeModel({ model: 'auto', endpoint: 'generate', quality: 'low' })).toEqual({
      model: 'gpt-image-2.5-flare',
      routed: true,
      reason: expect.stringContaining('gpt-image-2.5-flare'),
    })
  })

  test('auto + generate at a finalizing quality routes to sunburst', () => {
    for (const quality of ['high', 'xhigh', 'max'] as const) {
      const result = routeModel({ model: 'auto', endpoint: 'generate', quality })
      expect(result.model).toBe('gpt-image-2.5-sunburst')
      expect(result.routed).toBe(true)
    }
  })

  test('auto + edit always routes to sunburst regardless of quality', () => {
    const result = routeModel({ model: 'auto', endpoint: 'edit', quality: 'low' })
    expect(result.model).toBe('gpt-image-2.5-sunburst')
    expect(result.routed).toBe(true)
  })

  test('an explicit model is always honored, never reported as routed', () => {
    expect(routeModel({ model: 'gpt-image-2.5-flare', endpoint: 'edit', quality: 'high' })).toEqual(
      { model: 'gpt-image-2.5-flare', routed: false },
    )
    expect(
      routeModel({ model: 'gpt-image-2.5-sunburst', endpoint: 'generate', quality: 'low' }),
    ).toEqual({ model: 'gpt-image-2.5-sunburst', routed: false })
  })
})

describe('validateBackground', () => {
  test('opaque and auto are always fine on both generatable models', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const) {
      expect(validateBackground(model, 'opaque')).toBeNull()
      expect(validateBackground(model, 'auto')).toBeNull()
    }
  })

  test('transparent is accepted on both generatable models (real alpha channel)', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const) {
      expect(validateBackground(model, 'transparent')).toBeNull()
    }
  })
})

describe('validateTransparentFormat', () => {
  test('transparent + jpeg is rejected, naming the missing alpha channel', () => {
    const error = validateTransparentFormat('transparent', 'jpeg')
    expect(error).toMatch(/alpha channel/)
  })

  test('transparent + png/webp is fine, and jpeg is fine when not transparent', () => {
    expect(validateTransparentFormat('transparent', 'png')).toBeNull()
    expect(validateTransparentFormat('transparent', 'webp')).toBeNull()
    expect(validateTransparentFormat('opaque', 'jpeg')).toBeNull()
  })
})

describe('validateSize', () => {
  test('gpt-image-2.5-flare accepts a preset', () => {
    expect(validateSize('gpt-image-2.5-flare', '1024x1024')).toBeNull()
  })

  test('gpt-image-2.5-sunburst accepts a valid arbitrary size (2560x1440)', () => {
    expect(validateSize('gpt-image-2.5-sunburst', '2560x1440')).toBeNull()
  })

  test('gpt-image-2.5-flare rejects a size not a multiple of 16', () => {
    expect(validateSize('gpt-image-2.5-flare', '1000x1000')).toMatch(/multiples of 16/)
  })

  test('gpt-image-2.5-flare rejects an aspect ratio beyond 3:1', () => {
    expect(validateSize('gpt-image-2.5-flare', '3200x256')).toMatch(/aspect ratio/)
  })

  test('gpt-image-2.5-flare rejects a pixel count below the minimum', () => {
    expect(validateSize('gpt-image-2.5-flare', '256x256')).toMatch(/pixel count/)
  })

  test('gpt-image-2.5-flare rejects an edge above the max', () => {
    expect(validateSize('gpt-image-2.5-flare', '3840x1024')).toMatch(/3839/)
  })
})

describe('validateInputFidelity', () => {
  test('undefined is always fine', () => {
    expect(validateInputFidelity('gpt-image-2.5-flare', undefined)).toBeNull()
  })

  test('both 2.5 models reject input_fidelity outright', () => {
    expect(validateInputFidelity('gpt-image-2.5-flare', 'high')).toMatch(/does not support/)
    expect(validateInputFidelity('gpt-image-2.5-sunburst', 'low')).toMatch(/does not support/)
  })
})

describe('validateQuality', () => {
  test('low/medium/high/auto are always fine', () => {
    for (const quality of ['low', 'medium', 'high', 'auto'] as const) {
      expect(validateQuality('gpt-image-2.5-flare', quality)).toBeNull()
    }
  })

  test('xhigh/max are fine on both 2.5 models', () => {
    expect(validateQuality('gpt-image-2.5-flare', 'xhigh')).toBeNull()
    expect(validateQuality('gpt-image-2.5-sunburst', 'max')).toBeNull()
  })
})
