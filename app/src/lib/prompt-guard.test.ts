import { describe, expect, test } from 'bun:test'
import { detectTransparencyClaim } from './prompt-guard'

describe('detectTransparencyClaim', () => {
  test('matches "transparent background"', () => {
    expect(detectTransparencyClaim('a red panda, isolated on a transparent background')).toBe(
      'transparent background',
    )
  })

  test('matches "transparent bg"', () => {
    expect(detectTransparencyClaim('product shot, transparent bg')).toBe('transparent bg')
  })

  test('matches "on transparency"', () => {
    expect(detectTransparencyClaim('render the logo on transparency')).toBe('on transparency')
  })

  test('matches "with transparency"', () => {
    expect(detectTransparencyClaim('export the icon with transparency')).toBe('with transparency')
  })

  test('matches "no background"', () => {
    expect(detectTransparencyClaim('a cat sticker, no background')).toBe('no background')
  })

  test('matches "without a background"', () => {
    expect(detectTransparencyClaim('a mug without a background')).toBe('without a background')
  })

  test('matches "without background"', () => {
    expect(detectTransparencyClaim('a mug without background')).toBe('without background')
  })

  test('matches "cutout"', () => {
    expect(detectTransparencyClaim('a die-cut cutout sticker of a fox')).toBe('cutout')
  })

  test('matches "cut-out"', () => {
    expect(detectTransparencyClaim('a cut-out sticker of a fox')).toBe('cut-out')
  })

  test('matches "cut out"', () => {
    expect(detectTransparencyClaim('a fox cut out of the scene')).toBe('cut out')
  })

  test('matches "alpha channel"', () => {
    expect(detectTransparencyClaim('export with a clean alpha channel')).toBe('alpha channel')
  })

  test('matches "checkerboard"', () => {
    expect(detectTransparencyClaim('render on a checkerboard pattern')).toBe('checkerboard')
  })

  test('matches "remove the background"', () => {
    expect(detectTransparencyClaim('a portrait, remove the background')).toBe(
      'remove the background',
    )
  })

  test('matches "background removed"', () => {
    expect(detectTransparencyClaim('a portrait, background removed')).toBe('background removed')
  })

  test('is case-insensitive', () => {
    expect(detectTransparencyClaim('A LOGO ON A TRANSPARENT BACKGROUND')).toBe(
      'TRANSPARENT BACKGROUND',
    )
  })

  test('returns null for a clean prompt', () => {
    expect(detectTransparencyClaim('a red panda eating bamboo in a bamboo forest')).toBeNull()
  })

  test('does not flag an unrelated mention of "transparent"', () => {
    expect(
      detectTransparencyClaim('packaging mockup with a sheet of transparent plastic film'),
    ).toBeNull()
  })

  test('does not flag an ordinary solid-background prompt', () => {
    expect(
      detectTransparencyClaim('studio product photo on a plain white background, soft shadow'),
    ).toBeNull()
  })
})
