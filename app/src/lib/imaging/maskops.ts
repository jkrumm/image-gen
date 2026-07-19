/** Mask cleanup: morphology, feathering, hole-filling, speck removal, alpha compositing, and
 * edge color decontamination. */
import { labelComponents } from './ccl'
import { at, createMask, getAlpha, getRgba, setAlpha, setRgba } from './pixel'
import type { AlphaMask, Rgb, RgbaImage } from './types'

/** Erodes (`radius < 0`) or dilates (`radius > 0`) a mask by a square structuring element of
 * side `2*|radius|+1`. `radius === 0` is identity. Separable min/max filter (horizontal pass,
 * then vertical), so cost is `O(width * height * radius)` instead of `O(width * height *
 * radius^2)`. */
export function morphMask(mask: AlphaMask, radius: number): AlphaMask {
  if (radius === 0) return { width: mask.width, height: mask.height, data: mask.data.slice() }

  const erode = radius < 0
  const r = Math.abs(radius)
  const horizontal = boxExtreme(mask, r, erode, 'x')
  const vertical = boxExtreme(horizontal, r, erode, 'y')
  return vertical
}

function boxExtreme(mask: AlphaMask, r: number, erode: boolean, axis: 'x' | 'y'): AlphaMask {
  const out = createMask(mask.width, mask.height)
  const length = axis === 'x' ? mask.width : mask.height

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const fixed = axis === 'x' ? y : x
      const pos = axis === 'x' ? x : y
      let extreme = erode ? 255 : 0

      for (let d = -r; d <= r; d++) {
        const p = Math.min(Math.max(pos + d, 0), length - 1)
        const value = axis === 'x' ? getAlpha(mask, p, fixed) : getAlpha(mask, fixed, p)
        extreme = erode ? Math.min(extreme, value) : Math.max(extreme, value)
      }

      setAlpha(out, x, y, extreme)
    }
  }

  return out
}

/** Box blur x3 on the alpha channel (approximates a Gaussian via the central limit theorem).
 * Clamp-to-edge boundary handling, so total alpha is conserved to within a rounding error for
 * masks with margin around their content. */
export function featherMask(mask: AlphaMask, radius: number): AlphaMask {
  if (radius <= 0) return { width: mask.width, height: mask.height, data: mask.data.slice() }

  let current = mask
  for (let pass = 0; pass < 3; pass++) {
    current = boxBlurPass(current, radius, 'x')
    current = boxBlurPass(current, radius, 'y')
  }
  return current
}

function boxBlurPass(mask: AlphaMask, r: number, axis: 'x' | 'y'): AlphaMask {
  const out = createMask(mask.width, mask.height)
  const length = axis === 'x' ? mask.width : mask.height
  const window = 2 * r + 1

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const fixed = axis === 'x' ? y : x
      const pos = axis === 'x' ? x : y
      let sum = 0

      for (let d = -r; d <= r; d++) {
        const p = Math.min(Math.max(pos + d, 0), length - 1)
        sum += axis === 'x' ? getAlpha(mask, p, fixed) : getAlpha(mask, fixed, p)
      }

      setAlpha(out, x, y, Math.round(sum / window))
    }
  }

  return out
}

/** Fills enclosed background (hole) components smaller than `minArea`. Never fills a component
 * that touches the image border — that's the surrounding background, not a hole. */
export function fillHoles(mask: AlphaMask, minArea: number): AlphaMask {
  const isBackground = (x: number, y: number): boolean => getAlpha(mask, x, y) < 128
  const { width, height, labels, areas } = labelComponents(mask.width, mask.height, isBackground)

  const touchesBorder = new Set<number>()
  collectBorderLabels(labels, width, height, touchesBorder)

  const out = { width: mask.width, height: mask.height, data: mask.data.slice() }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x] ?? -1
      if (label === -1) continue
      if (touchesBorder.has(label)) continue
      if ((areas[label] ?? 0) >= minArea) continue
      setAlpha(out, x, y, 255)
    }
  }

  return out
}

function collectBorderLabels(
  labels: Int32Array,
  width: number,
  height: number,
  touchesBorder: Set<number>,
): void {
  for (let x = 0; x < width; x++) {
    addIfLabeled(labels[x] ?? -1, touchesBorder)
    addIfLabeled(labels[(height - 1) * width + x] ?? -1, touchesBorder)
  }
  for (let y = 0; y < height; y++) {
    addIfLabeled(labels[y * width] ?? -1, touchesBorder)
    addIfLabeled(labels[y * width + (width - 1)] ?? -1, touchesBorder)
  }
}

function addIfLabeled(label: number, set: Set<number>): void {
  if (label !== -1) set.add(label)
}

/** Removes foreground components smaller than `minArea` (sets their alpha to 0). `minArea === 0`
 * is identity, since area is always >= 1. */
export function removeSpecks(mask: AlphaMask, minArea: number): AlphaMask {
  const isForeground = (x: number, y: number): boolean => getAlpha(mask, x, y) >= 128
  const { width, height, labels, areas } = labelComponents(mask.width, mask.height, isForeground)

  const out = { width: mask.width, height: mask.height, data: mask.data.slice() }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x] ?? -1
      if (label === -1) continue
      if ((areas[label] ?? 0) >= minArea) continue
      setAlpha(out, x, y, 0)
    }
  }

  return out
}

/** Replaces an image's alpha channel with a mask's values (straight alpha stays straight — RGB
 * is never touched). */
export function applyAlpha(src: RgbaImage, mask: AlphaMask): RgbaImage {
  const out: RgbaImage = { width: src.width, height: src.height, data: src.data.slice() }
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [r, g, b] = getRgba(src, x, y)
      setRgba(out, x, y, r, g, b, getAlpha(mask, x, y))
    }
  }
  return out
}

export function intersectMasks(a: AlphaMask, b: AlphaMask): AlphaMask {
  const out = createMask(a.width, a.height)
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.min(at(a.data, i), at(b.data, i))
  }
  return out
}

/** Floor on alpha used only inside the decontamination division, so near-transparent pixels
 * don't blow the estimate up. */
const DEFRINGE_ALPHA_FLOOR = 0.15

/** Color decontamination for antialiased edge pixels: `C = aF + (1-a)B`, so `F = (C -
 * (1-a)B) / a`. Only touches partially-transparent pixels (0 < alpha < 255) — fully transparent
 * or fully opaque pixels need no correction. `strength` (0-1) lerps between the original color
 * and the recovered `F`. */
export function defringe(src: RgbaImage, background: Rgb, strength: number): RgbaImage {
  const out: RgbaImage = { width: src.width, height: src.height, data: src.data.slice() }
  const [br, bg, bb] = background

  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [r, g, b, a] = getRgba(src, x, y)
      if (a === 0 || a === 255) continue

      const af = Math.max(a / 255, DEFRINGE_ALPHA_FLOOR)
      const fr = clamp255((r - (1 - af) * br) / af)
      const fg = clamp255((g - (1 - af) * bg) / af)
      const fb = clamp255((b - (1 - af) * bb) / af)

      setRgba(
        out,
        x,
        y,
        Math.round(r + strength * (fr - r)),
        Math.round(g + strength * (fg - g)),
        Math.round(b + strength * (fb - b)),
        a,
      )
    }
  }

  return out
}

function clamp255(v: number): number {
  return Math.min(Math.max(v, 0), 255)
}
