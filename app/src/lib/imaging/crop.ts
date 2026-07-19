import { getAlpha } from './pixel'
import type { AlphaMask, Rect, RgbaImage } from './types'

/** Clamps a rect to lie fully within `[0, width) x [0, height)`, with non-negative integer
 * width/height. */
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x0 = Math.min(Math.max(Math.round(rect.x), 0), width)
  const y0 = Math.min(Math.max(Math.round(rect.y), 0), height)
  const x1 = Math.min(Math.max(Math.round(rect.x + rect.width), x0), width)
  const y1 = Math.min(Math.max(Math.round(rect.y + rect.height), y0), height)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function cropImage(src: RgbaImage, rect: Rect): RgbaImage {
  const clamped = clampRect(rect, src.width, src.height)
  const data = new Uint8ClampedArray(clamped.width * clamped.height * 4)

  for (let y = 0; y < clamped.height; y++) {
    const srcRowStart = ((clamped.y + y) * src.width + clamped.x) * 4
    const dstRowStart = y * clamped.width * 4
    const rowBytes = clamped.width * 4
    data.set(src.data.subarray(srcRowStart, srcRowStart + rowBytes), dstRowStart)
  }

  return { width: clamped.width, height: clamped.height, data }
}

/** Bounding box of pixels with alpha strictly greater than `threshold` ("trim to content").
 * Returns a zero-size rect at the origin if nothing clears the threshold. */
export function contentBounds(mask: AlphaMask, threshold = 0): Rect {
  let minX = mask.width
  let minY = mask.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (getAlpha(mask, x, y) <= threshold) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}
