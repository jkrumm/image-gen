/** Named export targets for the Refine workbench's Export panel. Pure data — no DOM/Tauri
 * dependency — consumed by `Refine.tsx`/`ExportPanel` (which resizes + bakes + calls
 * `derived.ts`) and pinned by `exportPresets.test.ts`. */

export type ExportTarget = {
  /** Filename (without extension), relative to the preset's own output folder. */
  name: string
  size: number
}

/**
 * Apple's `iconutil -c icns <name>.iconset` input: exactly these 10 files, verified against
 * Apple's docs. `icon_16x16@2x` and `icon_32x32` are both 32px despite the different name —
 * `iconutil` requires both regardless.
 */
export const MACOS_ICONSET: readonly ExportTarget[] = [
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
]

/** Standard favicon / web app icon set. */
export const FAVICON_SET: readonly ExportTarget[] = [
  { name: 'favicon-16', size: 16 },
  { name: 'favicon-32', size: 32 },
  { name: 'favicon-48', size: 48 },
  { name: 'apple-touch-icon', size: 180 },
  { name: 'favicon-192', size: 192 },
  { name: 'favicon-512', size: 512 },
]

/** `'native'` exports the baked image at its own resolution; a number exports the long edge
 * scaled to that size (aspect preserved — unlike the icon presets above, this isn't assumed
 * square). */
export const SINGLE_PNG_SIZES: readonly ('native' | number)[] = ['native', 1024, 512, 256]
