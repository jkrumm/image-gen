/** The Refine workbench: a fixed, ordered pipeline (crop -> background -> mask cleanup ->
 * transform -> shape -> pad -> export) the user tunes params for, never reorders. Owns the recipe
 * + loaded source image state; every panel is a dumb slice-in/patch-out component, and
 * `useRefinePreview` does the actual pipeline recompute (off the main thread — see that file). */
import { Accordion, Card, Group, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { error as logError } from '@tauri-apps/plugin-log'
import { EmptyState } from 'basalt-ui'
import { useEffect, useMemo, useState } from 'react'
import type { RefineSeed } from '../App'
import { BackgroundPanel } from '../components/refine/BackgroundPanel'
import { CropPanel } from '../components/refine/CropPanel'
import { ExportPanel } from '../components/refine/ExportPanel'
import { PadPanel } from '../components/refine/PadPanel'
import { RefineCanvas, type PreviewMode, type SeedPoint } from '../components/refine/RefineCanvas'
import { ShapePanel } from '../components/refine/ShapePanel'
import { TransformPanel } from '../components/refine/TransformPanel'
import { useRefinePreview } from '../components/refine/useRefinePreview'
import { sampleSeedColor } from '../lib/imaging/color'
import { contentBounds } from '../lib/imaging/crop'
import { loadImageData } from '../lib/imaging/dom'
import { applyRecipe, buildAlpha } from '../lib/imaging/pipeline'
import { recipeSchema, type Recipe } from '../lib/imaging/recipe'
import type { RgbaImage } from '../lib/imaging/types'

/** UI-level defaults, deliberately different from `RECIPE_DEFAULTS` (the pipeline's own no-op
 * defaults): tolerance 16 / softness 30 are the values verified to clear a gpt-image-2 background
 * cleanly (see CLAUDE.md's load-bearing facts), and 0 min-area for speck removal means "off" —
 * `removeSpecks(mask, 0)` is already an identity per its own doc, so no boolean toggle is needed. */
const INITIAL_RECIPE: Recipe = recipeSchema.parse({
  v: 1,
  background: { tolerance: 16, softness: 30 },
  maskCleanup: { removeSpecksMinArea: 0 },
})

/** Fixed neutral matte — enough contrast to reveal a background-removal halo without favoring
 * light or dark artwork. */
const MATTE_COLOR = '#808080'

/** Fraction-space distance (relative to image width) within which an alt-click removes a seed. */
const SEED_REMOVE_RADIUS = 0.06

type RefineProps = {
  seed: RefineSeed | null
}

export function Refine({ seed }: RefineProps) {
  const [source, setSource] = useState<RgbaImage | null>(null)
  const [recipe, setRecipe] = useState<Recipe>(INITIAL_RECIPE)
  const [mode, setMode] = useState<PreviewMode>('checkerboard')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!seed) return
    setSource(null)
    setRecipe(seed.recipe ?? INITIAL_RECIPE)
    setLoading(true)
    loadImageData(seed.image)
      .then(setSource)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        void logError(`refine: failed to load image: ${message}`)
        notifications.show({ color: 'red', title: 'Could not load image', message })
      })
      .finally(() => setLoading(false))
  }, [seed])

  const preview = useRefinePreview(source, recipe, mode)

  function updateCrop(patch: Partial<Recipe['crop']>): void {
    setRecipe((r) => ({ ...r, crop: { ...r.crop, ...patch } }))
  }
  function updateBackground(patch: Partial<Recipe['background']>): void {
    setRecipe((r) => ({ ...r, background: { ...r.background, ...patch } }))
  }
  function updateMaskCleanup(patch: Partial<Recipe['maskCleanup']>): void {
    setRecipe((r) => ({ ...r, maskCleanup: { ...r.maskCleanup, ...patch } }))
  }
  function updateTransform(patch: Partial<Recipe['transform']>): void {
    setRecipe((r) => ({ ...r, transform: { ...r.transform, ...patch } }))
  }
  function updateShape(patch: Partial<Recipe['shape']>): void {
    setRecipe((r) => ({ ...r, shape: { ...r.shape, ...patch } }))
  }
  function updatePad(patch: Partial<Recipe['pad']>): void {
    setRecipe((r) => ({ ...r, pad: { ...r.pad, ...patch } }))
  }

  function addSeed(point: SeedPoint): void {
    setRecipe((r) => ({
      ...r,
      background: { ...r.background, seeds: [...r.background.seeds, point] },
    }))
  }

  function removeSeedNear(point: SeedPoint): void {
    setRecipe((r) => {
      const seeds = r.background.seeds
      let nearestIndex = -1
      let nearestDist = Number.POSITIVE_INFINITY
      seeds.forEach((s, index) => {
        const dist = Math.hypot(s.x - point.x, s.y - point.y)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestIndex = index
        }
      })
      if (nearestIndex === -1 || nearestDist > SEED_REMOVE_RADIUS) return r
      return {
        ...r,
        background: { ...r.background, seeds: seeds.filter((_, index) => index !== nearestIndex) },
      }
    })
  }

  /** Runs background removal on the *uncropped* preview to find the tightest content rect, then
   * scales it up to native pixels and sets it as an explicit crop rect. Only meaningful once
   * background removal is enabled — hence the `canTrimToContent` gate in `CropPanel`. */
  function trimToContent(): void {
    if (!preview.previewSrc || !source) return
    const fullMask = buildAlpha(preview.previewSrc, recipe)
    const bounds = contentBounds(fullMask)
    if (bounds.width === 0 || bounds.height === 0) return
    const scaleX = source.width / preview.previewSrc.width
    const scaleY = source.height / preview.previewSrc.height
    updateCrop({
      enabled: true,
      autoTrim: false,
      rect: {
        x: Math.round(bounds.x * scaleX),
        y: Math.round(bounds.y * scaleY),
        width: Math.round(bounds.width * scaleX),
        height: Math.round(bounds.height * scaleY),
      },
    })
  }

  const seedColor = useMemo<readonly [number, number, number] | null>(() => {
    if (!preview.croppedPreview || !recipe.background.enabled) return null
    const firstPick = recipe.background.seeds[0]
    const point =
      recipe.background.mode === 'picks' && firstPick
        ? {
            x: firstPick.x * preview.croppedPreview.width,
            y: firstPick.y * preview.croppedPreview.height,
          }
        : { x: 0, y: 0 }
    return sampleSeedColor(preview.croppedPreview, point)
  }, [preview.croppedPreview, recipe.background])

  const transparentPct = useMemo(() => {
    if (!preview.mask) return null
    let count = 0
    for (let i = 0; i < preview.mask.data.length; i++) {
      if ((preview.mask.data[i] ?? 0) <= 0) count++
    }
    return count / preview.mask.data.length
  }, [preview.mask])

  const displayImage: RgbaImage | null =
    mode === 'mask'
      ? preview.maskPreview
      : mode === 'original'
        ? preview.previewSrc
        : preview.composed

  // Seed fractions are relative to `croppedPreview` (what the background stage actually
  // consumes) — picking against 'original' (the uncropped preview) would place them in the wrong
  // space, so picking is disabled in that one mode.
  const pickInteractive =
    recipe.background.mode === 'picks' && recipe.background.enabled && mode !== 'original'

  // Pan and seed-picking share the same canvas gesture (drag/click), so they're kept mutually
  // exclusive rather than requiring a modifier key or tracking which accordion section is open
  // (the accordion allows several sections open at once, so "active section" isn't well-defined
  // here): panning is armed whenever Picks mode isn't. 'original' has no transform applied to it
  // either (it's the pre-crop source), so panning there would have no visible effect.
  const panInteractive =
    mode !== 'original' && !(recipe.background.mode === 'picks' && recipe.background.enabled)

  function bake(): RgbaImage | null {
    return source ? applyRecipe(source, recipe) : null
  }

  if (!seed) {
    return (
      <EmptyState
        title="No image selected"
        description="Open a generation from the Library and choose Refine to start the workbench."
      />
    )
  }

  return (
    <Stack gap="lg" p="lg" maw={1100} mx="auto">
      <Group justify="space-between">
        <Title order={4}>Refine</Title>
        {loading && (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        )}
      </Group>

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Stack gap="sm" style={{ flex: '1 1 420px', minWidth: 320 }}>
          <SegmentedControl
            value={mode}
            onChange={(value) => setMode(value as PreviewMode)}
            data={[
              { label: 'Checkerboard', value: 'checkerboard' },
              { label: 'Matte', value: 'matte' },
              { label: 'Mask', value: 'mask' },
              { label: 'Original', value: 'original' },
            ]}
          />
          <RefineCanvas
            displayImage={displayImage}
            mode={mode}
            matteColor={MATTE_COLOR}
            interactive={pickInteractive}
            seeds={recipe.background.seeds}
            onAddSeed={addSeed}
            onRemoveSeedNear={removeSeedNear}
            panInteractive={panInteractive}
            transform={recipe.transform}
            onTransformChange={updateTransform}
          />
        </Stack>

        <Card withBorder style={{ flex: '1 1 360px', minWidth: 320 }}>
          <Accordion
            multiple
            defaultValue={['crop', 'background', 'transform', 'shape', 'pad', 'export']}
          >
            <Accordion.Item value="crop">
              <Accordion.Control>Crop</Accordion.Control>
              <Accordion.Panel>
                <CropPanel
                  crop={recipe.crop}
                  imageSize={source}
                  onChange={updateCrop}
                  canTrimToContent={recipe.background.enabled}
                  onTrimToContent={trimToContent}
                />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="background">
              <Accordion.Control>Background</Accordion.Control>
              <Accordion.Panel>
                <BackgroundPanel
                  background={recipe.background}
                  maskCleanup={recipe.maskCleanup}
                  onBackgroundChange={updateBackground}
                  onMaskCleanupChange={updateMaskCleanup}
                  seedColor={seedColor}
                  transparentPct={transparentPct}
                />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="transform">
              <Accordion.Control>Transform</Accordion.Control>
              <Accordion.Panel>
                <TransformPanel transform={recipe.transform} onChange={updateTransform} />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="shape">
              <Accordion.Control>Shape</Accordion.Control>
              <Accordion.Panel>
                <ShapePanel shape={recipe.shape} onChange={updateShape} />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="pad">
              <Accordion.Control>Padding</Accordion.Control>
              <Accordion.Panel>
                <PadPanel pad={recipe.pad} onChange={updatePad} />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="export">
              <Accordion.Control>Export</Accordion.Control>
              <Accordion.Panel>
                <ExportPanel generationId={seed.generationId} recipe={recipe} bake={bake} />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Card>
      </Group>
    </Stack>
  )
}
