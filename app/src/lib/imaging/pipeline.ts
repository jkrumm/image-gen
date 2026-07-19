/** Orchestrates the Refine stages (crop -> background removal -> mask cleanup -> transform ->
 * shape mask -> pad/resize) into the entry points a view needs: the full output image
 * (`applyRecipe`), the alpha mask alone (`buildAlpha`, for a mask-only preview or trim-to-content),
 * and both at once (`buildPreview`, for the live-preview worker so mask and composed never redo
 * each other's work). Individual stages stay exported from their own modules so a view can memoize
 * per stage instead of re-running the whole chain on every param tweak. */
import { sampleSeedColor } from './color'
import { clampRect, contentBounds, cropImage } from './crop'
import { backgroundAlpha } from './background'
import { alphaChannelMask } from './pixel'
import {
  applyAlpha,
  defringe,
  featherMask,
  fillHoles,
  intersectMasks,
  morphMask,
  removeSpecks,
} from './maskops'
import { padImage } from './pad'
import type { Recipe } from './recipe'
import { shapeMask, type ShapeSpec } from './shape'
import { isIdentityTransform, transformImage } from './transform'
import type { AlphaMask, Rect, RgbaImage } from './types'

function shapeSpecFrom(shape: Recipe['shape']): ShapeSpec {
  if (shape.kind === 'none' || shape.kind === 'circle') return { kind: shape.kind }
  return { kind: shape.kind, radiusPct: shape.radiusPct }
}

function cropRect(img: RgbaImage, crop: Recipe['crop']): Rect {
  if (crop.autoTrim) return contentBounds(alphaChannelMask(img))
  return crop.rect ?? { x: 0, y: 0, width: img.width, height: img.height }
}

function cornerSeeds(img: RgbaImage) {
  return [
    { x: 0, y: 0 },
    { x: img.width - 1, y: 0 },
    { x: 0, y: img.height - 1 },
    { x: img.width - 1, y: img.height - 1 },
  ]
}

/** Resolves a recipe's background seeds against a concrete image. 'picks' seeds are stored as
 * fractional (0-1) coordinates (see `recipe.ts`), so they're scaled to this image's own pixel
 * dimensions here rather than baked to an absolute size anywhere upstream. Falls back to
 * `cornerSeeds` when in 'picks' mode with nothing placed yet. */
function backgroundSeeds(img: RgbaImage, background: Recipe['background']) {
  if (background.mode === 'picks' && background.seeds.length > 0) {
    return background.seeds.map((seed) => ({ x: seed.x * img.width, y: seed.y * img.height }))
  }
  return cornerSeeds(img)
}

/** Shape masks depend only on (width, height, spec) — not the image or any other recipe field —
 * so dragging Tolerance/Feather/etc. must never rebuild the squircle's corner curve. Bounded so a
 * long session touching many distinct sizes/radii doesn't grow the cache unbounded. */
const SHAPE_MASK_CACHE_LIMIT = 32
const shapeMaskCache = new Map<string, AlphaMask>()

function cachedShapeMask(width: number, height: number, spec: ShapeSpec): AlphaMask {
  const key = `${width}x${height}:${spec.kind}${'radiusPct' in spec ? `:${spec.radiusPct}` : ''}`
  const cached = shapeMaskCache.get(key)
  if (cached) return cached

  const mask = shapeMask(width, height, spec)
  if (shapeMaskCache.size >= SHAPE_MASK_CACHE_LIMIT) {
    const oldestKey = shapeMaskCache.keys().next().value
    if (oldestKey !== undefined) shapeMaskCache.delete(oldestKey)
  }
  shapeMaskCache.set(key, mask)
  return mask
}

/** Background removal + mask cleanup only — no transform, no shape. Shared by `buildAlpha` and
 * `buildPreview` so the two can never drift apart. */
function cleanedAlpha(img: RgbaImage, recipe: Recipe): AlphaMask {
  let mask: AlphaMask = {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.width * img.height).fill(255),
  }

  if (recipe.background.enabled) {
    mask = backgroundAlpha(img, {
      seeds: backgroundSeeds(img, recipe.background),
      tolerance: recipe.background.tolerance,
      softness: recipe.background.softness,
    })
  }

  if (recipe.maskCleanup.fillHoles) mask = fillHoles(mask, recipe.maskCleanup.fillHolesMinArea)
  if (recipe.maskCleanup.removeSpecks) {
    mask = removeSpecks(mask, recipe.maskCleanup.removeSpecksMinArea)
  }
  if (recipe.maskCleanup.morph !== 0) mask = morphMask(mask, recipe.maskCleanup.morph)
  if (recipe.maskCleanup.feather > 0) mask = featherMask(mask, recipe.maskCleanup.feather)

  return mask
}

/** Builds the alpha mask alone (background removal + mask cleanup + transform + shape). `img`
 * should already reflect any crop stage. When `recipe.transform` is a no-op (the default) this
 * skips straight to intersecting with the shape — no image compositing needed — which keeps the
 * transform-untouched chain exactly as cheap as it was before transform existed, and skips the
 * shape stage entirely when `shape.kind === 'none'` (also the default). */
export function buildAlpha(img: RgbaImage, recipe: Recipe): AlphaMask {
  const cleaned = cleanedAlpha(img, recipe)

  if (isIdentityTransform(recipe.transform)) {
    if (recipe.shape.kind === 'none') return cleaned
    const shape = cachedShapeMask(img.width, img.height, shapeSpecFrom(recipe.shape))
    return intersectMasks(cleaned, shape)
  }

  // Transform moves the artwork (RGB + alpha together) within the canvas before the shape clips
  // it, so the cleaned mask has to be baked into the image and resampled, not just intersected.
  const composited = applyAlpha(img, cleaned)
  const transformed = transformImage(composited, recipe.transform)
  const shape = cachedShapeMask(transformed.width, transformed.height, shapeSpecFrom(recipe.shape))
  return intersectMasks(alphaChannelMask(transformed), shape)
}

/** Runs everything after the crop stage in one pass — background removal -> mask cleanup ->
 * transform -> shape -> edge decontamination -> pad — computing the mask and the composed image
 * together so neither redoes the other's work. `img` should already reflect any crop stage. This
 * is the entry point the Refine preview worker calls per recipe tick, and what `applyRecipe` calls
 * for the full bake. */
export function buildPreview(
  img: RgbaImage,
  recipe: Recipe,
): { mask: AlphaMask; composed: RgbaImage } {
  if (isIdentityTransform(recipe.transform)) {
    const mask = buildAlpha(img, recipe)
    let composed = img
    if (recipe.maskCleanup.defringeStrength > 0) {
      const background = sampleSeedColor(img, { x: 0, y: 0 })
      composed = defringe(composed, background, recipe.maskCleanup.defringeStrength)
    }
    composed = applyAlpha(composed, mask)
    if (recipe.pad.insetPct > 0) composed = padImage(composed, recipe.pad.insetPct)
    return { mask, composed }
  }

  const cleaned = cleanedAlpha(img, recipe)
  let composed = img
  if (recipe.maskCleanup.defringeStrength > 0) {
    const background = sampleSeedColor(img, { x: 0, y: 0 })
    composed = defringe(composed, background, recipe.maskCleanup.defringeStrength)
  }
  composed = applyAlpha(composed, cleaned)
  composed = transformImage(composed, recipe.transform)
  const shape = cachedShapeMask(composed.width, composed.height, shapeSpecFrom(recipe.shape))
  const mask = intersectMasks(alphaChannelMask(composed), shape)
  composed = applyAlpha(composed, mask)
  if (recipe.pad.insetPct > 0) composed = padImage(composed, recipe.pad.insetPct)
  return { mask, composed }
}

/** Runs the full recipe end to end: crop -> background removal -> mask cleanup -> transform ->
 * shape mask -> pad/resize. */
export function applyRecipe(src: RgbaImage, recipe: Recipe): RgbaImage {
  let img = src

  if (recipe.crop.enabled) {
    img = cropImage(img, clampRect(cropRect(img, recipe.crop), img.width, img.height))
  }

  return buildPreview(img, recipe).composed
}
