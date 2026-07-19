/**
 * Low-level buffer/index helpers shared by every imaging module. Centralizing index math and the
 * `noUncheckedIndexedAccess` guard here keeps the rest of the pipeline reading like pixel math,
 * not bounds-checking boilerplate.
 */
import type { AlphaMask, RgbaImage } from './types'

/** Typed-array reads are `number | undefined` under `noUncheckedIndexedAccess`; in-bounds access
 * is always a number at runtime, out-of-bounds is `undefined` at runtime too, so `0` is a safe,
 * intentional fallback (treats out-of-bounds as black/transparent). */
export function at(data: Uint8ClampedArray, i: number): number {
  return data[i] ?? 0
}

export function pixelIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4
}

export function maskIndex(width: number, x: number, y: number): number {
  return y * width + x
}

export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function createMask(width: number, height: number, fill = 0): AlphaMask {
  const data = new Uint8ClampedArray(width * height)
  if (fill !== 0) data.fill(fill)
  return { width, height, data }
}

export function getRgba(img: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = pixelIndex(img.width, x, y)
  return [at(img.data, i), at(img.data, i + 1), at(img.data, i + 2), at(img.data, i + 3)]
}

export function setRgba(
  img: RgbaImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const i = pixelIndex(img.width, x, y)
  img.data[i] = r
  img.data[i + 1] = g
  img.data[i + 2] = b
  img.data[i + 3] = a
}

export function getAlpha(mask: AlphaMask, x: number, y: number): number {
  return at(mask.data, maskIndex(mask.width, x, y))
}

export function setAlpha(mask: AlphaMask, x: number, y: number, value: number): void {
  mask.data[maskIndex(mask.width, x, y)] = value
}

/** Extracts an image's own alpha channel as a mask (e.g. for auto-trim on a PNG that already
 * carries transparency, before any background removal runs). */
export function alphaChannelMask(img: RgbaImage): AlphaMask {
  const mask = createMask(img.width, img.height)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      setAlpha(mask, x, y, getRgba(img, x, y)[3])
    }
  }
  return mask
}

export function cloneImage(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
}

export function cloneMask(mask: AlphaMask): AlphaMask {
  return { width: mask.width, height: mask.height, data: new Uint8ClampedArray(mask.data) }
}
