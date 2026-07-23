import { describe, expect, test } from 'bun:test'
import {
  createDraftSchema,
  describeDraftNotices,
  parseCreateDraft,
  type CreateDraft,
} from './draft'

/** A draft as written by the current UI: nothing to coerce. */
function makeDraft(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    brief: 'a lighthouse at dusk',
    delta: '',
    prompt: 'a lighthouse at dusk, oil painting',
    rawMode: false,
    intent: 'auto',
    model: 'auto',
    sizeChoice: 'auto',
    customSize: '',
    quality: 'auto',
    background: 'auto',
    outputFormat: 'png',
    n: 1,
    moderation: 'auto',
    inputFidelityChoice: 'default',
    pinnedFields: [],
    ...overrides,
  }
}

describe('parseCreateDraft', () => {
  test('reads back a current draft unchanged, with no notices', () => {
    const parsed = parseCreateDraft(makeDraft())
    expect(parsed?.notices).toEqual([])
    expect(parsed?.draft.brief).toBe('a lighthouse at dusk')
    expect(parsed?.draft.model).toBe('auto')
  })

  test('a corrupt or absent draft reads back as undefined rather than throwing', () => {
    expect(parseCreateDraft(undefined)).toBeUndefined()
    expect(parseCreateDraft({ version: 99 })).toBeUndefined()
    expect(parseCreateDraft('not an object')).toBeUndefined()
  })
})

describe('a draft persisted before the studio went gpt-image-2-only', () => {
  // A real draft naming a now-retired model exists on disk. The schema deliberately still
  // ACCEPTS it: narrowing the enum would fail safeParse and silently discard the user's
  // half-finished brief along with the dead setting.
  test('a draft naming gpt-image-1.5 loads instead of being discarded', () => {
    const parsed = parseCreateDraft(makeDraft({ model: 'gpt-image-1.5' }))
    expect(parsed).toBeDefined()
    expect(parsed?.draft.brief).toBe('a lighthouse at dusk')
    expect(parsed?.draft.prompt).toBe('a lighthouse at dusk, oil painting')
  })

  test('the retired model is coerced onto gpt-image-2 and reported, not silently swapped', () => {
    const parsed = parseCreateDraft(makeDraft({ model: 'gpt-image-1.5' }))
    expect(parsed?.draft.model).toBe('gpt-image-2')
    expect(parsed?.notices).toContainEqual(
      expect.objectContaining({ field: 'model', from: 'gpt-image-1.5', to: 'gpt-image-2' }),
    )
  })

  test('a transparent background is coerced to opaque and reported', () => {
    const parsed = parseCreateDraft(makeDraft({ background: 'transparent' }))
    expect(parsed?.draft.background).toBe('opaque')
    expect(parsed?.notices).toContainEqual(
      expect.objectContaining({ field: 'background', from: 'transparent', to: 'opaque' }),
    )
  })

  test('a stored input fidelity is reported as dropped', () => {
    const parsed = parseCreateDraft(makeDraft({ inputFidelityChoice: 'low' }))
    expect(parsed?.notices).toContainEqual(
      expect.objectContaining({ field: 'input fidelity', from: 'low' }),
    )
  })

  test('all three coercions are collected together and rendered into one line', () => {
    const parsed = parseCreateDraft(
      makeDraft({
        model: 'gpt-image-1-mini',
        background: 'transparent',
        inputFidelityChoice: 'high',
      }),
    )
    expect(parsed?.notices).toHaveLength(3)
    const described = describeDraftNotices(parsed?.notices ?? [])
    expect(described).toContain('gpt-image-1-mini')
    expect(described).toContain('transparent')
    expect(described).toContain('input fidelity')
  })

  test('the coerced draft round-trips back through the schema on the next autosave', () => {
    const parsed = parseCreateDraft(
      makeDraft({ model: 'gpt-image-1.5', background: 'transparent' }),
    )
    const rewritten = createDraftSchema.parse({
      ...parsed?.draft,
      inputFidelityChoice: 'default',
    } satisfies CreateDraft)
    expect(rewritten.model).toBe('gpt-image-2')
    expect(rewritten.background).toBe('opaque')
  })
})
