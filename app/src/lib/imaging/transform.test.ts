import { describe, expect, test } from 'bun:test'
import { createImage, getRgba, setRgba } from './pixel'
import { isIdentityTransform, transformImage } from './transform'

describe('isIdentityTransform', () => {
  test('true only for scale 1, offsets 0', () => {
    expect(isIdentityTransform({ scale: 1, offsetX: 0, offsetY: 0 })).toBe(true)
    expect(isIdentityTransform({ scale: 1.01, offsetX: 0, offsetY: 0 })).toBe(false)
    expect(isIdentityTransform({ scale: 1, offsetX: 0.1, offsetY: 0 })).toBe(false)
    expect(isIdentityTransform({ scale: 1, offsetX: 0, offsetY: -0.1 })).toBe(false)
  })
})

describe('transformImage', () => {
  test('scale 1, offset 0 is identity -- byte-for-byte', () => {
    const src = createImage(10, 10)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) setRgba(src, x, y, x * 10, y * 10, 5, 255)
    }
    const result = transformImage(src, { scale: 1, offsetX: 0, offsetY: 0 })
    expect(result.width).toBe(src.width)
    expect(result.height).toBe(src.height)
    expect(Array.from(result.data)).toEqual(Array.from(src.data))
  })

  test('scaling down centers content on a transparent canvas', () => {
    const size = 20
    const src = createImage(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) setRgba(src, x, y, 10, 20, 30, 255)
    }
    const result = transformImage(src, { scale: 0.5, offsetX: 0, offsetY: 0 })
    expect(result.width).toBe(size)
    expect(result.height).toBe(size)
    // Corners fall outside the shrunk content.
    expect(getRgba(result, 0, 0)[3]).toBe(0)
    expect(getRgba(result, size - 1, size - 1)[3]).toBe(0)
    // Center still carries the (scaled) content.
    expect(getRgba(result, size / 2, size / 2)).toEqual([10, 20, 30, 255])
  })

  test('scaling up crops to the canvas but keeps the center covered', () => {
    const size = 10
    const src = createImage(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) setRgba(src, x, y, 40, 50, 60, 255)
    }
    const result = transformImage(src, { scale: 2, offsetX: 0, offsetY: 0 })
    expect(result.width).toBe(size)
    expect(result.height).toBe(size)
    expect(getRgba(result, size / 2, size / 2)).toEqual([40, 50, 60, 255])
  })

  test('a positive offset shifts content toward the bottom-right', () => {
    const size = 20
    const src = createImage(size, size)
    setRgba(src, 2, 2, 200, 0, 0, 255)
    const result = transformImage(src, { scale: 1, offsetX: 0.3, offsetY: 0.3 })
    // offsetX/offsetY 0.3 of a 20px canvas is a 6px shift: (2,2) -> (8,8).
    expect(getRgba(result, 8, 8)).toEqual([200, 0, 0, 255])
    expect(getRgba(result, 2, 2)[3]).toBe(0) // original spot now uncovered (transparent)
  })

  test('an offset that pushes content fully off-canvas leaves it entirely transparent', () => {
    const size = 10
    const src = createImage(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) setRgba(src, x, y, 1, 2, 3, 255)
    }
    const result = transformImage(src, { scale: 1, offsetX: 1, offsetY: 0 })
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        expect(getRgba(result, x, y)[3]).toBe(0)
      }
    }
  })
})
