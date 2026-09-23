import { describe, expect, test } from 'bun:test'
import { IMAGE_MODELS, KNOWN_IMAGE_MODELS, SIZE_PRESETS } from './contract.js'
import {
  resolveModel,
  routingReason,
  snapSizeForModel,
  validateBackgroundForModel,
  validateInputFidelityForModel,
  validateQualityForModel,
  validateSizeForModel,
  validateTransparentOutputFormat,
} from './rules.js'

describe('snapSizeForModel', () => {
  test('the invariant: snapping always produces a size that validates, for every model', () => {
    const dims = [1, 5000, 12000, 50, 640, 1254, 1237, 991, 16, 3839, 10, 9999, 655, 8294]
    const inputs: string[] = []
    for (const w of dims) {
      for (const h of dims) {
        inputs.push(`${w}x${h}`)
      }
    }

    for (const model of IMAGE_MODELS) {
      for (const size of inputs) {
        const snapped = snapSizeForModel(model, size)
        expect(validateSizeForModel(model, snapped)).toBeNull()
      }
    }
  })

  test('the invariant holds across a wide random spread too', () => {
    for (const model of IMAGE_MODELS) {
      for (let i = 0; i < 2000; i++) {
        const width = 10 + Math.floor(Math.random() * 9989)
        const height = 10 + Math.floor(Math.random() * 9989)
        const snapped = snapSizeForModel(model, `${width}x${height}`)
        expect(validateSizeForModel(model, snapped)).toBeNull()
      }
    }
  })

  test("'auto' round-trips unchanged for every model", () => {
    for (const model of IMAGE_MODELS) {
      expect(snapSizeForModel(model, 'auto')).toBe('auto')
    }
  })

  test('every preset round-trips unchanged for every model', () => {
    for (const model of IMAGE_MODELS) {
      for (const preset of SIZE_PRESETS) {
        expect(snapSizeForModel(model, preset)).toBe(preset)
      }
    }
  })

  test('the observed regression case: 1254x1254 on gpt-image-2 snaps to a valid size', () => {
    const snapped = snapSizeForModel('gpt-image-2', '1254x1254')
    expect(snapped).toBe('1248x1248')
    expect(validateSizeForModel('gpt-image-2', snapped)).toBeNull()
  })

  test('an already-valid custom size on gpt-image-2 is returned unchanged', () => {
    expect(snapSizeForModel('gpt-image-2', '2560x1440')).toBe('2560x1440')
  })

  // Superseded by generation being gpt-image-2-only: a presets-only model no
  // longer folds a custom WxH to its own presets, because it is no longer the
  // model that actually generates. See "legacy replay" below for the current
  // (correct) behaviour of the exact same inputs.
  test('a WxH already valid on gpt-image-2 passes through unchanged, even when named against a presets-only legacy model', () => {
    expect(snapSizeForModel('gpt-image-1.5', '2000x800')).toBe('2000x800')
    expect(snapSizeForModel('gpt-image-1-mini', '800x2000')).toBe('800x2000')
  })

  test('garbage input falls back to auto rather than throwing', () => {
    for (const model of IMAGE_MODELS) {
      expect(snapSizeForModel(model, '')).toBe('auto')
      expect(snapSizeForModel(model, 'banana')).toBe('auto')
      expect(snapSizeForModel(model, '1024x')).toBe('auto')
      expect(snapSizeForModel(model, '0x0')).toBe('auto')
    }
  })
})

describe('snapSizeForModel — legacy replay (gpt-image-2-only generation)', () => {
  // Regression coverage for the data-loss-adjacent bug class this split guards
  // against: retiring a model from generation must never make replay of an
  // existing sidecar produce a size the (now sole) generatable model rejects.

  test('a gpt-image-1.5 preset size still round-trips unchanged (valid on every model)', () => {
    expect(snapSizeForModel('gpt-image-1.5', '1536x1024')).toBe('1536x1024')
    expect(validateSizeForModel('gpt-image-2', '1536x1024')).toBeNull()
  })

  test('a gpt-image-1.5 custom WxH — invalid for gpt-image-2 because it is not a multiple of 16 — snaps into a size gpt-image-2 accepts, not to a gpt-image-1.5 preset', () => {
    const snapped = snapSizeForModel('gpt-image-1.5', '1000x1010')
    expect(validateSizeForModel('gpt-image-2', snapped)).toBeNull()
    // Never a silent identity/garbage fallback: the input was invalid, so the output must differ.
    expect(snapped).not.toBe('1000x1010')
  })

  test('a gpt-image-1-mini recorded size replays as a size gpt-image-2 accepts', () => {
    const snapped = snapSizeForModel('gpt-image-1-mini', '1254x1254')
    expect(validateSizeForModel('gpt-image-2', snapped)).toBeNull()
  })

  test('the invariant holds for every known model, including retired ones: snapping always yields a size gpt-image-2 accepts', () => {
    const dims = ['2000x800', '1254x1254', '1000x1010', '640x480', 'auto', '1536x1024', 'banana']
    for (const model of KNOWN_IMAGE_MODELS) {
      for (const size of dims) {
        const snapped = snapSizeForModel(model, size)
        expect(validateSizeForModel('gpt-image-2', snapped)).toBeNull()
      }
    }
  })
})

describe('validateBackgroundForModel', () => {
  test('rejects transparent background on gpt-image-2 with an actionable message', () => {
    const error = validateBackgroundForModel('gpt-image-2', 'transparent')
    expect(error).not.toBeNull()
    expect(error).toContain('alpha channel')
  })

  test('accepts opaque and auto background on gpt-image-2', () => {
    expect(validateBackgroundForModel('gpt-image-2', 'opaque')).toBeNull()
    expect(validateBackgroundForModel('gpt-image-2', 'auto')).toBeNull()
  })
})

describe('validateInputFidelityForModel', () => {
  test('rejects input_fidelity on gpt-image-2 with an actionable message', () => {
    const error = validateInputFidelityForModel('gpt-image-2', 'high')
    expect(error).not.toBeNull()
    expect(error).toContain('input_fidelity')
  })

  test('accepts an undefined input_fidelity on gpt-image-2', () => {
    expect(validateInputFidelityForModel('gpt-image-2', undefined)).toBeNull()
  })

  test('rejects input_fidelity on both 2.5 models too — neither supports it', () => {
    expect(validateInputFidelityForModel('gpt-image-2.5-flare', 'high')).toContain('input_fidelity')
    expect(validateInputFidelityForModel('gpt-image-2.5-sunburst', 'low')).toContain(
      'input_fidelity',
    )
  })
})

describe('validateTransparentOutputFormat', () => {
  test('rejects transparent + jpeg with an actionable message', () => {
    const error = validateTransparentOutputFormat('transparent', 'jpeg')
    expect(error).not.toBeNull()
    expect(error).toContain('alpha channel')
  })

  test('accepts transparent + png/webp, and any output format when background is not transparent', () => {
    expect(validateTransparentOutputFormat('transparent', 'png')).toBeNull()
    expect(validateTransparentOutputFormat('transparent', 'webp')).toBeNull()
    expect(validateTransparentOutputFormat('opaque', 'jpeg')).toBeNull()
    expect(validateTransparentOutputFormat('auto', 'jpeg')).toBeNull()
  })
})

describe('validateQualityForModel', () => {
  test('rejects xhigh/max on models without extendedQuality', () => {
    for (const model of ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini'] as const) {
      expect(validateQualityForModel(model, 'xhigh')).not.toBeNull()
      expect(validateQualityForModel(model, 'max')).not.toBeNull()
    }
  })

  test('accepts xhigh/max on both 2.5 models', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const) {
      expect(validateQualityForModel(model, 'xhigh')).toBeNull()
      expect(validateQualityForModel(model, 'max')).toBeNull()
    }
  })

  test('never rejects low/medium/high/auto on any model', () => {
    for (const model of KNOWN_IMAGE_MODELS) {
      expect(validateQualityForModel(model, 'low')).toBeNull()
      expect(validateQualityForModel(model, 'medium')).toBeNull()
      expect(validateQualityForModel(model, 'high')).toBeNull()
      expect(validateQualityForModel(model, 'auto')).toBeNull()
    }
  })
})

describe('resolveModel / routingReason', () => {
  test('an explicit model is always honoured, on either endpoint/quality', () => {
    expect(resolveModel({ model: 'gpt-image-2.5-flare', endpoint: 'edit', quality: 'high' })).toBe(
      'gpt-image-2.5-flare',
    )
    expect(
      routingReason({ model: 'gpt-image-2.5-flare', endpoint: 'edit', quality: 'high' }),
    ).toBeNull()
  })

  test('auto + edit always routes to sunburst, regardless of quality', () => {
    for (const quality of ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const) {
      expect(resolveModel({ model: 'auto', endpoint: 'edit', quality })).toBe(
        'gpt-image-2.5-sunburst',
      )
      expect(routingReason({ model: 'auto', endpoint: 'edit', quality })).not.toBeNull()
    }
  })

  test('auto + generate at high/xhigh/max routes to sunburst', () => {
    for (const quality of ['high', 'xhigh', 'max'] as const) {
      expect(resolveModel({ model: 'auto', endpoint: 'generate', quality })).toBe(
        'gpt-image-2.5-sunburst',
      )
    }
  })

  test('auto + generate at low/medium/auto routes to flare', () => {
    for (const quality of ['low', 'medium', 'auto'] as const) {
      expect(resolveModel({ model: 'auto', endpoint: 'generate', quality })).toBe(
        'gpt-image-2.5-flare',
      )
    }
  })

  describe('a legacy request model (deploy-compat shim)', () => {
    test('routes exactly like auto — generate low to flare, edit to sunburst', () => {
      expect(resolveModel({ model: 'gpt-image-2', endpoint: 'generate', quality: 'low' })).toBe(
        'gpt-image-2.5-flare',
      )
      expect(resolveModel({ model: 'gpt-image-2', endpoint: 'generate', quality: 'high' })).toBe(
        'gpt-image-2.5-sunburst',
      )
      expect(resolveModel({ model: 'gpt-image-2', endpoint: 'edit', quality: 'low' })).toBe(
        'gpt-image-2.5-sunburst',
      )
    })

    test('still reports routed (non-null reason) naming the retired id, unlike auto', () => {
      const legacyReason = routingReason({
        model: 'gpt-image-2',
        endpoint: 'generate',
        quality: 'low',
      })
      const autoReason = routingReason({ model: 'auto', endpoint: 'generate', quality: 'low' })
      expect(legacyReason).not.toBeNull()
      expect(legacyReason).toContain('gpt-image-2')
      expect(legacyReason).toContain('retired')
      expect(legacyReason).not.toBe(autoReason)
    })
  })
})
