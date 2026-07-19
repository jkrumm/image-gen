/** Scales and repositions the artwork within a same-size canvas — lets the user zoom/pan the
 * source image inside whatever shape crops it, instead of being stuck at native 1:1 placement.
 * Implemented as a single area-weighted resample into a transparent canvas the same size as `src`:
 * `resizeImage` does the actual per-axis averaging for the scale step, this just works out which
 * scaled-source region lands at which output offset. */
import { createImage, getRgba, setRgba } from './pixel'
import { resizeImage } from './pad'
import type { RgbaImage } from './types'

export type Transform = { scale: number; offsetX: number; offsetY: number }

/** `scale: 1, offsetX: 0, offsetY: 0` — the loaded artwork at its native placement, no-op. */
export function isIdentityTransform(t: Transform): boolean {
  return t.scale === 1 && t.offsetX === 0 && t.offsetY === 0
}

/** Resamples `src` into a same-size transparent canvas, scaled about its center by `scale` and
 * shifted by `offsetX`/`offsetY` (fractions of the canvas, -1..1; positive moves content toward
 * the bottom-right). `scale: 1, offsetX: 0, offsetY: 0` is identity — returns an exact clone, no
 * resampling, so the no-op case costs nothing extra and the pipeline stays byte-for-byte with the
 * pre-transform composition when the user hasn't touched zoom/pan. */
export function transformImage(src: RgbaImage, transform: Transform): RgbaImage {
  if (isIdentityTransform(transform)) {
    return { width: src.width, height: src.height, data: src.data.slice() }
  }

  // Guard against a degenerate zero/negative scale reaching the resize math below; the UI slider
  // itself is already bounded to [0.1, 4] via the recipe schema.
  const scale = Math.max(transform.scale, 0.001)
  const scaledWidth = Math.max(1, Math.round(src.width * scale))
  const scaledHeight = Math.max(1, Math.round(src.height * scale))
  const scaled = resizeImage(src, scaledWidth, scaledHeight)

  const out = createImage(src.width, src.height)
  const offsetX = Math.round(transform.offsetX * src.width + (src.width - scaledWidth) / 2)
  const offsetY = Math.round(transform.offsetY * src.height + (src.height - scaledHeight) / 2)

  const startSx = Math.max(0, -offsetX)
  const startSy = Math.max(0, -offsetY)
  const endSx = Math.min(scaledWidth, src.width - offsetX)
  const endSy = Math.min(scaledHeight, src.height - offsetY)

  for (let sy = startSy; sy < endSy; sy++) {
    const dy = offsetY + sy
    for (let sx = startSx; sx < endSx; sx++) {
      const dx = offsetX + sx
      const [r, g, b, a] = getRgba(scaled, sx, sy)
      setRgba(out, dx, dy, r, g, b, a)
    }
  }

  return out
}
