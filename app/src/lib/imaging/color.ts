/**
 * Color space conversion and distance. Background removal must compare colors the way a human
 * perceives them, not raw sRGB Euclidean distance (sRGB is not perceptually uniform) — see
 * `deltaE76`.
 */
import { getRgba } from './pixel'
import type { Point, Rgb, RgbaImage } from './types'

export type Lab = readonly [number, number, number]

/** CIE76 "just noticeable difference" — pairs below this are visually indistinguishable. */
export const DELTA_E_JND = 2.3

const D65_WHITE = { x: 0.95047, y: 1.0, z: 1.08883 }
const LAB_EPSILON = 0.008856
const LAB_KAPPA = 7.787

/**
 * sRGB→linear for all 256 possible channel values, precomputed. The naive form costs a `** 2.4`
 * per channel, i.e. three pow() per pixel — on a 1024² flood fill that alone dominates the frame
 * budget and makes slider drags visibly stutter. The input is always an integer 0-255 (it comes
 * out of a Uint8ClampedArray), so a table is exact here, not an approximation.
 */
const LINEAR_LUT = /* @__PURE__ */ (() => {
  const lut = new Float64Array(256)
  for (let c = 0; c < 256; c++) {
    const v = c / 255
    lut[c] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return lut
})()

function srgbChannelToLinear(c: number): number {
  const i = c < 0 ? 0 : c > 255 ? 255 : c | 0
  return LINEAR_LUT[i] as number
}

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : LAB_KAPPA * t + 16 / 116
}

/** sRGB (0-255 per channel) -> CIE L*a*b* (D65 illuminant). */
export function srgbToLab([r, g, b]: Rgb): Lab {
  const rl = srgbChannelToLinear(r)
  const gl = srgbChannelToLinear(g)
  const bl = srgbChannelToLinear(b)

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65_WHITE.x
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / D65_WHITE.y
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65_WHITE.z

  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIE76 Euclidean distance in L*a*b* space. */
export function deltaE76(a: Lab, b: Lab): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

/**
 * ΔE76 between a raw sRGB triple and an already-converted Lab, allocating nothing. Identical in
 * result to `deltaE76(srgbToLab([r, g, b]), lab)`, but that form allocates two arrays per call —
 * which, in a per-pixel flood fill, is the difference between a smooth drag and a stuttering one.
 * Pinned equivalent to the composed form by a test.
 */
export function deltaE76FromSrgb(r: number, g: number, b: number, lab: Lab): number {
  const rl = srgbChannelToLinear(r)
  const gl = srgbChannelToLinear(g)
  const bl = srgbChannelToLinear(b)

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65_WHITE.x
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / D65_WHITE.y
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65_WHITE.z

  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)

  const dl = 116 * fy - 16 - lab[0]
  const da = 500 * (fx - fy) - lab[1]
  const db = 200 * (fy - fz) - lab[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

function median9(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[4] ?? 0
}

/** Median of a 3x3 patch centered on `point` (per channel), clamped to image bounds. Never
 * hardcode an exact background color (e.g. pure white) — gpt-image backgrounds drift a few
 * levels off #FFFFFF, so sampling is the only thing that actually clears the background. */
export function sampleSeedColor(src: RgbaImage, point: Point): Rgb {
  const cx = Math.min(Math.max(Math.round(point.x), 0), src.width - 1)
  const cy = Math.min(Math.max(Math.round(point.y), 0), src.height - 1)

  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.min(Math.max(cx + dx, 0), src.width - 1)
      const y = Math.min(Math.max(cy + dy, 0), src.height - 1)
      const [r, g, b] = getRgba(src, x, y)
      rs.push(r)
      gs.push(g)
      bs.push(b)
    }
  }

  return [median9(rs), median9(gs), median9(bs)]
}
