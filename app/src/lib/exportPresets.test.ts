import { describe, expect, test } from 'bun:test'
import { MACOS_ICONSET } from './exportPresets'

describe('MACOS_ICONSET', () => {
  test('has exactly the 10 files iconutil requires, with the right pixel sizes', () => {
    expect(MACOS_ICONSET).toEqual([
      { name: 'icon_16x16', size: 16 },
      { name: 'icon_16x16@2x', size: 32 },
      { name: 'icon_32x32', size: 32 },
      { name: 'icon_32x32@2x', size: 64 },
      { name: 'icon_128x128', size: 128 },
      { name: 'icon_128x128@2x', size: 256 },
      { name: 'icon_256x256', size: 256 },
      { name: 'icon_256x256@2x', size: 512 },
      { name: 'icon_512x512', size: 512 },
      { name: 'icon_512x512@2x', size: 1024 },
    ])
  })

  test('every name is unique', () => {
    const names = MACOS_ICONSET.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
