/** The Refine pipeline's persisted recipe: every stage's params, with a default for every field
 * so `{ v: 1 }` alone parses into a fully-specified, no-op-by-default recipe. */
import { z } from 'zod'

const cropSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Explicit crop rect; ignored when `autoTrim` is set. `null` means "full image". */
    rect: z
      .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .nullable()
      .default(null),
    /** Trim to the image's own alpha-channel content bounds instead of an explicit rect. */
    autoTrim: z.boolean().default(false),
  })
  .prefault({})

const backgroundSeedSchema = z.object({
  /** Fractional (0-1) image coordinates — resolution-independent so a seed placed on a ≤512px
   * live preview lands on the same content when the recipe is later baked at native resolution. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const backgroundRemovalSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** 'corners' seeds the flood fill from the four image corners (the default). 'picks' uses
     * user-placed `seeds` instead, falling back to corners when none have been placed yet. */
    mode: z.enum(['corners', 'picks']).default('corners'),
    seeds: z.array(backgroundSeedSchema).default(() => []),
    tolerance: z.number().min(0).default(8),
    softness: z.number().min(0).default(6),
  })
  .prefault({})

const maskCleanupSchema = z
  .object({
    fillHoles: z.boolean().default(true),
    fillHolesMinArea: z.number().min(0).default(64),
    removeSpecks: z.boolean().default(true),
    removeSpecksMinArea: z.number().min(0).default(16),
    /** Negative erodes, positive dilates, 0 is a no-op. */
    morph: z.number().default(0),
    feather: z.number().min(0).default(0),
    /** 0 disables edge decontamination entirely. */
    defringeStrength: z.number().min(0).max(1).default(0),
  })
  .prefault({})

const transformSchema = z
  .object({
    /** 0.1 (way out) - 4 (way in); 1 is the loaded artwork at its native placement in the canvas. */
    scale: z.number().min(0.1).max(4).default(1),
    /** Fraction of the canvas, -1..1; 0 is centered, positive moves toward the bottom-right. */
    offsetX: z.number().min(-1).max(1).default(0),
    offsetY: z.number().min(-1).max(1).default(0),
  })
  .prefault({})

const shapeSchema = z
  .object({
    kind: z.enum(['none', 'circle', 'appleSquircle', 'roundedRect']).default('none'),
    /** Fraction of the shorter side, 0.225 is the Apple default. */
    radiusPct: z.number().min(0).max(0.5).default(0.225),
  })
  .prefault({})

const padSchema = z
  .object({
    insetPct: z.number().min(0).max(0.49).default(0),
  })
  .prefault({})

export const recipeSchema = z.object({
  v: z.literal(1),
  crop: cropSchema,
  background: backgroundRemovalSchema,
  maskCleanup: maskCleanupSchema,
  transform: transformSchema,
  shape: shapeSchema,
  pad: padSchema,
})
export type Recipe = z.infer<typeof recipeSchema>

/** The fully-resolved, no-op default recipe — same shape a fresh `{ v: 1 }` parses into. */
export const RECIPE_DEFAULTS: Recipe = recipeSchema.parse({ v: 1 })
