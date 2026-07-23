import {
  DEFAULT_MODEL,
  IMAGE_MODELS,
  INTENTS,
  KNOWN_IMAGE_MODELS,
  generationParentSchema,
} from '@image-gen/shared'
import { z } from 'zod'

/**
 * Persisted Create-surface draft (concept §2: "Create state is persisted... half-finished work
 * is resumable days later"). Written/read through `studioStore.writeCreateDraft`/`readCreateDraft`
 * (G3's `.imagegen/drafts/create.json`), which deliberately treats the draft as an opaque JSON
 * blob and leaves the shape to this module — see studio-store.ts's module comment.
 *
 * Reference images are intentionally NOT persisted here: they arrive as in-memory browser `File`
 * objects (drag-drop / file dialog / library picker), and there is no capability in this app to
 * write arbitrary binary blobs outside `library.ts`'s own save paths without touching
 * `app/src/lib/**` (out of this surface's ownership this wave). Everything else — brief, prompt,
 * settings, pinned overrides, delta/lineage context, intent/project/style-guide selection —
 * survives a restart; attached references do not. Flagged in the G4b handover as a follow-up.
 *
 * `model` and `background` stay deliberately WIDE (`KNOWN_IMAGE_MODELS`, including `transparent`)
 * even though neither is selectable any more. A draft written before the studio went
 * gpt-image-2-only exists on disk right now; narrowing the schema would make `safeParse` fail and
 * silently discard the whole draft — losing a half-finished brief, not just a dead setting. The
 * values are parsed, then coerced by `parseCreateDraft` with a notice for each change.
 */
export const createDraftSchema = z.object({
  version: z.literal(1),
  brief: z.string().default(''),
  delta: z.string().default(''),
  prompt: z.string().default(''),
  rawMode: z.boolean().default(false),
  intent: z.enum(INTENTS).default('auto'),
  model: z.enum([...KNOWN_IMAGE_MODELS, 'auto'] as const).default('auto'),
  sizeChoice: z.string().default('auto'),
  customSize: z.string().default(''),
  quality: z.enum(['auto', 'low', 'medium', 'high']).default('auto'),
  background: z.enum(['auto', 'opaque', 'transparent']).default('auto'),
  outputFormat: z.enum(['png', 'webp', 'jpeg']).default('png'),
  outputCompression: z.number().int().min(0).max(100).optional(),
  n: z.number().int().min(1).max(10).default(1),
  moderation: z.enum(['auto', 'low']).default('auto'),
  /** Retained for backward compatibility only — gpt-image-2 rejects `input_fidelity`, so the
   * control is gone and this is always written as `'default'`. */
  inputFidelityChoice: z.enum(['default', 'high', 'low']).default('default'),
  pinnedFields: z.array(z.string()).default([]),
  parent: generationParentSchema.optional(),
  currentPrompt: z.string().optional(),
  projectSlug: z.string().optional(),
  styleGuideSlug: z.string().optional(),
})
export type CreateDraft = z.infer<typeof createDraftSchema>

/** The narrowed draft the Create surface actually drives its controls from: every field is a value
 * the current, single-model UI can represent. */
export type LoadedDraft = Omit<CreateDraft, 'model' | 'background'> & {
  model: 'gpt-image-2' | 'auto'
  background: 'auto' | 'opaque'
}

/** A setting that had to change for the draft to be loadable — shown to the user, never applied
 * silently (concept §2's central taboo). */
export type DraftNotice = { field: string; from: string; to: string; reason: string }

export type ParsedDraft = { draft: LoadedDraft; notices: DraftNotice[] }

function isGeneratable(model: string): model is 'gpt-image-2' {
  return (IMAGE_MODELS as readonly string[]).includes(model)
}

/**
 * Never throws — a corrupt or absent draft just reads back as `undefined`, same as a first run.
 * A draft that names a retired model or a transparent background parses fine and is coerced onto
 * the generatable model, with a notice per change for the caller to surface.
 */
export function parseCreateDraft(raw: unknown): ParsedDraft | undefined {
  const parsed = createDraftSchema.safeParse(raw)
  if (!parsed.success) return undefined

  const { model: storedModel, background: storedBackground, ...rest } = parsed.data
  const notices: DraftNotice[] = []

  const model = storedModel === 'auto' || isGeneratable(storedModel) ? storedModel : DEFAULT_MODEL
  if (model !== storedModel) {
    notices.push({
      field: 'model',
      from: storedModel,
      to: model,
      reason: `${storedModel} is retired — the studio generates with ${model} only`,
    })
  }

  const background = storedBackground === 'transparent' ? 'opaque' : storedBackground
  if (background !== storedBackground) {
    notices.push({
      field: 'background',
      from: storedBackground,
      to: background,
      reason: `${DEFAULT_MODEL} has no alpha channel and cannot generate a transparent background`,
    })
  }

  if (rest.inputFidelityChoice !== 'default') {
    notices.push({
      field: 'input fidelity',
      from: rest.inputFidelityChoice,
      to: 'unset',
      reason: `${DEFAULT_MODEL} rejects input_fidelity outright (it is always high)`,
    })
  }

  return { draft: { ...rest, model, background }, notices }
}

/** One-line summary of the coercions applied while loading a draft, for a notification body. */
export function describeDraftNotices(notices: DraftNotice[]): string {
  return notices
    .map((notice) => `${notice.field}: ${notice.from} → ${notice.to} (${notice.reason})`)
    .join('; ')
}
