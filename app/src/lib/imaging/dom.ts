/**
 * The ONLY DOM adapter for the imaging core: decodes a file/blob into an `RgbaImage`, encodes an
 * `RgbaImage` back to a PNG `Blob`, and converts between the two so a canvas can render either
 * direction. Everything else in `lib/imaging/` stays a pure function over plain arrays — this
 * file is where that meets `document`/`canvas`/`Blob`.
 *
 * UNVERIFIED in the Tauri WKWebView: `createImageBitmap(..., { colorSpaceConversion: 'none' })`
 * plus a `colorSpace: 'srgb'` 2D context is the standard way to stop color management from
 * shifting gpt-image-2's measured ~253 "white" background, but nobody has confirmed it holds in
 * WKWebView specifically. `loadImageData` logs the decoded corner pixel via `tauri-plugin-log` so
 * a human can check `~/Library/Logs/com.jkrumm.image-gen/imagegen.log` and confirm it reads ~253,
 * not something color-managed away from that.
 */
import { debug as logDebug } from '@tauri-apps/plugin-log'
import type { Point, RgbaImage } from './types'

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
  if (!ctx) throw new Error('Canvas has no 2D context')
  return ctx
}

/** Decodes a file/blob into an `RgbaImage` at its natural pixel dimensions, straight (not
 * premultiplied) alpha — the same shape a `bun test` fixture builds by hand. */
export async function loadImageData(source: Blob | File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(source, { colorSpaceConversion: 'none' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = get2dContext(canvas)
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    const [r, g, b, a] = imageData.data
    void logDebug(
      `loadImageData: decoded ${canvas.width}x${canvas.height}, corner pixel rgba(${r},${g},${b},${a})`,
    )

    return imageData
  } finally {
    bitmap.close()
  }
}

/** Wraps an `RgbaImage`'s own buffer in a real `ImageData`, for `putImageData`/`toPngBlob`. Never
 * shares the source buffer — `ImageData`'s backing array must not alias data the caller still
 * mutates (e.g. a live pipeline memo). */
export function toImageData(img: RgbaImage): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height)
}

/** Encodes an `RgbaImage` to a PNG `Blob`. Alpha is preserved — callers that need an opaque
 * export (e.g. a matte preview) must composite before calling this, not after. */
export function toPngBlob(img: RgbaImage): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = get2dContext(canvas)
  ctx.putImageData(toImageData(img), 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode PNG'))
    }, 'image/png')
  })
}

/** The subset of `DOMRect` this needs — kept structural (not `DOMRect` itself) so it stays
 * testable under `bun test` without a DOM lib. */
export type ViewportRect = { left: number; top: number; width: number; height: number }

/** A canvas's backing-store pixel dimensions, as opposed to its on-screen CSS size. */
export type CanvasPixelSize = { width: number; height: number }

/**
 * Pure pointer math: maps a client (viewport) point to the canvas's own pixel coordinates,
 * accounting for the canvas being scaled down via CSS from its native backing-store size. This is
 * `MaskCanvas.pointFromEvent` in `Edit.tsx` extracted so it's unit-testable — that inline version
 * is the cautionary tale (its Retina behavior has never been directly verified).
 */
export function pointToPixel(rect: ViewportRect, canvas: CanvasPixelSize, client: Point): Point {
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (client.x - rect.left) * scaleX,
    y: (client.y - rect.top) * scaleY,
  }
}
