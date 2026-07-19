/**
 * Background removal by seed-color distance in L*a*b*. Seeds are always sampled from the image
 * (never a hardcoded color) — gpt-image "white" backgrounds measure a few levels off #FFFFFF, so
 * an exact-equality matcher clears ~0% of the image.
 */
import { deltaE76FromSrgb, sampleSeedColor, srgbToLab, type Lab } from './color'
import { createMask, inBounds, maskIndex } from './pixel'
import type { AlphaMask, Point, RgbaImage } from './types'

export type BackgroundAlphaOptions = {
  /** Points to sample seed colors from, typically the image corners. */
  seeds: readonly Point[]
  /** ΔE below this is treated as fully background (mask = 0). Hard floor. */
  tolerance: number
  /** ΔE band above `tolerance` that ramps from 0 to 255 (mask). Above `tolerance + softness` is
   * fully foreground. Softness is what preserves a soft glow instead of hard-clipping it. */
  softness: number
}

/**
 * Returns the per-pixel foreground mask (255 = keep). Seeds serve two distinct purposes, and the
 * split is the whole point: they supply the background *colors* (sampled, never hardcoded) AND the
 * *starting points* of a flood fill. Only background reachable from a seed is cleared.
 *
 * Reachability is what a plain per-pixel ΔE threshold cannot express. A near-white region enclosed
 * by the subject — a wizard's beard inside a dark icon, a specular highlight, a white star core —
 * is background-colored but unreachable, so it stays opaque here while a global threshold punches a
 * hole straight through it. That difference is only visible at the tolerance needed to also remove
 * a soft drop-shadow, which is exactly when it matters.
 *
 * Pixels at or beyond `tolerance + softness` are walls: not background, and not traversed. So a
 * soft glow gets partial alpha and simultaneously bounds the fill — the frontier stops inside its
 * own falloff rather than eating through it.
 */
export function backgroundAlpha(src: RgbaImage, options: BackgroundAlphaOptions): AlphaMask {
  const { seeds, tolerance, softness } = options
  const { width, height } = src
  const seedLabs: Lab[] = seeds.map((seed) => srgbToLab(sampleSeedColor(src, seed)))
  const mask = createMask(width, height, 255)

  const visited = new Uint8Array(width * height)
  // Explicit stack: 1024² is 1.05M pixels and recursion would blow the JS stack.
  const stack = new Int32Array(width * height)
  let top = 0

  for (const seed of seeds) {
    const x = Math.round(seed.x)
    const y = Math.round(seed.y)
    if (!inBounds(width, height, x, y)) continue
    const index = maskIndex(width, x, y)
    if (visited[index]) continue
    visited[index] = 1
    stack[top++] = index
  }

  // Hot loop: reads `src.data` directly and pushes neighbors unrolled. The readable form
  // (getRgba + srgbToLab + a neighbor array literal) allocates six short-lived arrays per pixel,
  // which at 1024² is millions of allocations and turns a slider drag into a stutter.
  const wall = tolerance + softness
  const data = src.data
  const alpha = mask.data
  const last = width - 1
  const bottom = height - 1

  while (top > 0) {
    const index = stack[--top] as number
    const offset = index * 4

    let minDelta = Number.POSITIVE_INFINITY
    for (const seedLab of seedLabs) {
      const delta = deltaE76FromSrgb(
        data[offset] as number,
        data[offset + 1] as number,
        data[offset + 2] as number,
        seedLab,
      )
      if (delta < minDelta) minDelta = delta
    }
    if (minDelta >= wall) continue

    alpha[index] = deltaToAlpha(minDelta, tolerance, softness)

    const x = index % width
    if (x > 0 && !visited[index - 1]) {
      visited[index - 1] = 1
      stack[top++] = index - 1
    }
    if (x < last && !visited[index + 1]) {
      visited[index + 1] = 1
      stack[top++] = index + 1
    }
    const y = (index / width) | 0
    if (y > 0 && !visited[index - width]) {
      visited[index - width] = 1
      stack[top++] = index - width
    }
    if (y < bottom && !visited[index + width]) {
      visited[index + width] = 1
      stack[top++] = index + width
    }
  }

  return mask
}

function deltaToAlpha(delta: number, tolerance: number, softness: number): number {
  if (delta <= tolerance) return 0
  if (softness <= 0 || delta >= tolerance + softness) return 255
  return Math.round((255 * (delta - tolerance)) / softness)
}

/** Fraction of pixels at or below `threshold` alpha (fully/near transparent). */
export function transparentFraction(mask: AlphaMask, threshold = 0): number {
  let count = 0
  for (let i = 0; i < mask.data.length; i++) {
    if ((mask.data[i] ?? 0) <= threshold) count++
  }
  return count / mask.data.length
}
