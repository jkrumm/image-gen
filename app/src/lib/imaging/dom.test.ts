/**
 * Only `pointToPixel` is covered here — it's the one pure, DOM-free export of `dom.ts`.
 * `loadImageData`/`toPngBlob`/`toImageData` need a real `document`/canvas/`createImageBitmap`,
 * none of which exist under `bun test`; those stay UNVERIFIED until someone runs the app (see
 * `dom.ts`'s module doc and the handover notes). This file is also excluded from
 * `tsconfig.test.json`'s `tsc` project (see that file) since importing `dom.ts` pulls in DOM lib
 * types (`HTMLCanvasElement`, `ImageData`, …) that project's `lib` doesn't have — `bun test` still
 * runs it fine because it type-strips rather than type-checks.
 */
import { describe, expect, test } from 'bun:test'
import { pointToPixel } from './dom'

describe('pointToPixel', () => {
  test('maps a 1:1 (unscaled) canvas identically', () => {
    const rect = { left: 100, top: 50, width: 200, height: 200 }
    const canvas = { width: 200, height: 200 }
    expect(pointToPixel(rect, canvas, { x: 150, y: 90 })).toEqual({ x: 50, y: 40 })
  })

  test('scales down when the CSS box is larger than the backing store (Retina-style)', () => {
    // Backing store is 400x400 (2x device pixel ratio), displayed at 200x200 CSS px.
    const rect = { left: 0, top: 0, width: 200, height: 200 }
    const canvas = { width: 400, height: 400 }
    expect(pointToPixel(rect, canvas, { x: 50, y: 25 })).toEqual({ x: 100, y: 50 })
  })

  test('scales up when the CSS box is smaller than the backing store', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 }
    const canvas = { width: 50, height: 50 }
    expect(pointToPixel(rect, canvas, { x: 20, y: 40 })).toEqual({ x: 10, y: 20 })
  })

  test('accounts for the rect offset within the viewport', () => {
    const rect = { left: 30, top: 10, width: 100, height: 100 }
    const canvas = { width: 100, height: 100 }
    expect(pointToPixel(rect, canvas, { x: 30, y: 10 })).toEqual({ x: 0, y: 0 })
  })

  test('returns the origin for a zero-size rect instead of dividing by zero', () => {
    const rect = { left: 0, top: 0, width: 0, height: 0 }
    const canvas = { width: 100, height: 100 }
    expect(pointToPixel(rect, canvas, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 })
  })
})
