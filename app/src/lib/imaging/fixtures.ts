/** Synthetic image generators for tests — deterministic (no RNG), so failures reproduce
 * byte-for-byte. */
import { createImage, setRgba } from './pixel'
import type { Rgb, RgbaImage } from './types'

const DEFAULT_SIZE = 64

/** A near-flat background with small deterministic per-pixel drift, e.g. the ~253-with-drift
 * gpt-image-2 "white" background (fact: 84.2% of pixels sit above 250, 0% are exactly #FFFFFF). */
export function makeFlatBg(opts?: {
  width?: number
  height?: number
  bgColor?: Rgb
  drift?: number
}): RgbaImage {
  const width = opts?.width ?? DEFAULT_SIZE
  const height = opts?.height ?? DEFAULT_SIZE
  const bgColor = opts?.bgColor ?? [253, 253, 253]
  const drift = opts?.drift ?? 1

  const img = createImage(width, height)
  const span = 2 * drift + 1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = span > 0 ? ((x * 7 + y * 13) % span) - drift : 0
      setRgba(
        img,
        x,
        y,
        clamp255(bgColor[0] + offset),
        clamp255(bgColor[1] + offset),
        clamp255(bgColor[2] + offset),
        255,
      )
    }
  }

  return img
}

/** A flat background with a soft radial "glow" blob in the middle: solid foreground color out to
 * `radius`, then a linear color falloff to the background color over `glowWidth`, then flat
 * background. Produces genuine partial-alpha via `backgroundAlpha`'s color-distance ramp, not a
 * hard edge. */
export function makeGlowIcon(opts?: {
  width?: number
  height?: number
  bgColor?: Rgb
  fgColor?: Rgb
  radius?: number
  glowWidth?: number
}): RgbaImage {
  const width = opts?.width ?? DEFAULT_SIZE
  const height = opts?.height ?? DEFAULT_SIZE
  const bgColor = opts?.bgColor ?? [253, 253, 253]
  const fgColor = opts?.fgColor ?? [30, 90, 200]
  const radius = opts?.radius ?? Math.min(width, height) * 0.2
  const glowWidth = opts?.glowWidth ?? Math.min(width, height) * 0.2

  const img = createImage(width, height)
  const cx = width / 2
  const cy = height / 2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)

      const t = d <= radius ? 0 : d >= radius + glowWidth ? 1 : (d - radius) / glowWidth
      setRgba(
        img,
        x,
        y,
        Math.round(lerp(fgColor[0], bgColor[0], t)),
        Math.round(lerp(fgColor[1], bgColor[1], t)),
        Math.round(lerp(fgColor[2], bgColor[2], t)),
        255,
      )
    }
  }

  return img
}

const SATURATED_COLORS: Rgb[] = [
  [230, 30, 30],
  [30, 200, 60],
  [40, 60, 230],
  [230, 200, 20],
]

/** A flat background scattered with small saturated-color blocks. `connected: false` spaces them
 * apart (each stays its own connected component under 4-connectivity); `connected: true` places
 * them touching, edge to edge, so they merge into one component. */
export function makeSparkles(opts: {
  width?: number
  height?: number
  bgColor?: Rgb
  count: number
  connected: boolean
}): RgbaImage {
  const width = opts.width ?? DEFAULT_SIZE
  const height = opts.height ?? DEFAULT_SIZE
  const bgColor = opts.bgColor ?? [253, 253, 253]

  const img = createImage(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setRgba(img, x, y, bgColor[0], bgColor[1], bgColor[2], 255)
    }
  }

  const blockSize = opts.connected ? 3 : 2
  const spacing = opts.connected ? blockSize : blockSize + 4
  const startX = 4
  const startY = 4

  for (let i = 0; i < opts.count; i++) {
    const color = SATURATED_COLORS[i % SATURATED_COLORS.length] ?? [255, 0, 255]
    const cx = startX + i * spacing
    for (let dy = 0; dy < blockSize; dy++) {
      for (let dx = 0; dx < blockSize; dx++) {
        const x = cx + dx
        const y = startY + dy
        if (x >= width || y >= height) continue
        setRgba(img, x, y, color[0], color[1], color[2], 255)
      }
    }
  }

  return img
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp255(v: number): number {
  return Math.min(Math.max(v, 0), 255)
}
