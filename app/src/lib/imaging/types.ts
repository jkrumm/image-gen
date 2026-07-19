/**
 * Pure value types for the Refine imaging pipeline. No imports — this file must stay a leaf so
 * every other module (and the future DOM adapter) can depend on it without pulling anything in.
 *
 * `RgbaImage` is structurally satisfied by a real DOM `ImageData` (same `width`/`height`/`data`
 * shape), so a future canvas adapter can pass one in with zero copying, while `bun test` builds
 * plain objects. Keep this shape aligned with `ImageData` deliberately.
 */

/** Straight (un-premultiplied) RGBA pixel buffer, 4 bytes/px, row-major. */
export type RgbaImage = {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** Single-channel alpha mask, 1 byte/px, row-major. 255 = keep, 0 = discard. */
export type AlphaMask = {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

export type Rect = { x: number; y: number; width: number; height: number }

export type Point = { x: number; y: number }

export type Rgb = readonly [number, number, number]
