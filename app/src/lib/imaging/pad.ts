/** Padding (shrink content onto a transparent margin, canvas size unchanged) and resizing (box
 * filter, area-weighted so it works for both up- and downsampling). */
import { createImage, getRgba, setRgba } from './pixel'
import type { RgbaImage } from './types'

/** Shrinks the content by `insetPct` on each side and centers it on a transparent canvas of the
 * same size as `src`. `insetPct === 0` is identity; valid range is `[0, 0.5)`. */
export function padImage(src: RgbaImage, insetPct: number): RgbaImage {
  if (insetPct <= 0) return { width: src.width, height: src.height, data: src.data.slice() }

  const scale = 1 - 2 * insetPct
  const innerWidth = Math.max(1, Math.round(src.width * scale))
  const innerHeight = Math.max(1, Math.round(src.height * scale))
  const inner = resizeImage(src, innerWidth, innerHeight)

  const out = createImage(src.width, src.height)
  const offsetX = Math.round((src.width - innerWidth) / 2)
  const offsetY = Math.round((src.height - innerHeight) / 2)

  for (let y = 0; y < innerHeight; y++) {
    for (let x = 0; x < innerWidth; x++) {
      const [r, g, b, a] = getRgba(inner, x, y)
      setRgba(out, offsetX + x, offsetY + y, r, g, b, a)
    }
  }

  return out
}

/** Area-weighted box-filter resize: each output pixel averages the (possibly fractional) source
 * region it covers, weighted by overlap area. Handles both down- and upsampling. */
export function resizeImage(src: RgbaImage, width: number, height: number): RgbaImage {
  if (width === src.width && height === src.height) {
    return { width: src.width, height: src.height, data: src.data.slice() }
  }

  const out = createImage(width, height)
  const scaleX = src.width / width
  const scaleY = src.height / height

  for (let oy = 0; oy < height; oy++) {
    const srcY0 = oy * scaleY
    const srcY1 = srcY0 + scaleY
    for (let ox = 0; ox < width; ox++) {
      const srcX0 = ox * scaleX
      const srcX1 = srcX0 + scaleX
      const [r, g, b, a] = averageRegion(src, srcX0, srcX1, srcY0, srcY1)
      setRgba(out, ox, oy, r, g, b, a)
    }
  }

  return out
}

function averageRegion(
  src: RgbaImage,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): [number, number, number, number] {
  const ix0 = Math.max(0, Math.floor(x0))
  const ix1 = Math.min(src.width - 1, Math.ceil(x1) - 1)
  const iy0 = Math.max(0, Math.floor(y0))
  const iy1 = Math.min(src.height - 1, Math.ceil(y1) - 1)

  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumA = 0
  let totalWeight = 0

  for (let y = iy0; y <= iy1; y++) {
    const wy = overlap(y, y + 1, y0, y1)
    if (wy <= 0) continue
    for (let x = ix0; x <= ix1; x++) {
      const wx = overlap(x, x + 1, x0, x1)
      if (wx <= 0) continue
      const weight = wx * wy
      const [r, g, b, a] = getRgba(src, x, y)
      sumR += r * weight
      sumG += g * weight
      sumB += b * weight
      sumA += a * weight
      totalWeight += weight
    }
  }

  if (totalWeight <= 0) return [0, 0, 0, 0]
  return [
    Math.round(sumR / totalWeight),
    Math.round(sumG / totalWeight),
    Math.round(sumB / totalWeight),
    Math.round(sumA / totalWeight),
  ]
}

/** 1D overlap length between `[aStart, aEnd)` and `[bStart, bEnd)`. */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}
