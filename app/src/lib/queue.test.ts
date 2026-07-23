/**
 * Covers the pure decision logic `queue.ts` extracted from the `QueueProvider` closures:
 * the n=1 streaming gate, the `partial_images` ceiling sent when streaming, and the
 * partial-frame-to-data-URL decode. These are unit-testable in isolation; the surrounding
 * `runGenerate`/`runEdit`/`enqueueGenerate`/`enqueueEdit` orchestration (React state,
 * `AbortController` wiring, `saveGeneration`/`saveEdit`, notifications) calls
 * `@tauri-apps/plugin-http` and `@tauri-apps/plugin-fs` transitively and is unverified
 * here — driving the real app is the only way to confirm a job actually streams, cancels,
 * and saves end to end.
 */
import { describe, expect, test } from 'bun:test'
import { effectivePartialImages, previewDataUrl, shouldStreamJob } from './queue'

describe('shouldStreamJob', () => {
  test('streams when n is 1 and streaming was requested', () => {
    expect(shouldStreamJob(1, true)).toBe(true)
  })

  test('does not stream when streaming was not requested, even at n=1', () => {
    expect(shouldStreamJob(1, false)).toBe(false)
  })

  test('never streams above n=1 — the upstream hard constraint wins over an opt-in', () => {
    expect(shouldStreamJob(2, true)).toBe(false)
    expect(shouldStreamJob(10, true)).toBe(false)
  })

  test('defaults n to 1 when undefined (matches the contract schema default)', () => {
    expect(shouldStreamJob(undefined, true)).toBe(true)
  })
})

describe('effectivePartialImages', () => {
  test('defaults to 1 when the caller specified nothing', () => {
    expect(effectivePartialImages(undefined)).toBe(1)
  })

  test('defaults to 1 when the caller explicitly asked for 0 (still streams once opted in)', () => {
    expect(effectivePartialImages(0)).toBe(1)
  })

  test('preserves a caller-specified positive count', () => {
    expect(effectivePartialImages(2)).toBe(2)
    expect(effectivePartialImages(3)).toBe(3)
  })
})

describe('previewDataUrl', () => {
  test('builds an <img src>-ready data URL from a partial frame', () => {
    expect(previewDataUrl('png', 'ZmFrZQ==')).toBe('data:image/png;base64,ZmFrZQ==')
  })

  test('carries the frame format through, not a hardcoded one', () => {
    expect(previewDataUrl('webp', 'AA==')).toBe('data:image/webp;base64,AA==')
  })
})
