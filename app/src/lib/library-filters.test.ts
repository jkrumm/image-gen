import { describe, expect, test } from 'bun:test'
import { buildLibraryIndex } from './library-index'
import { filterLibraryEntries, type LibraryFilterState } from './library-filters'
import { generationMetadataSchema, type GenerationMetadataInput } from './metadata'

function makeEntry(overrides: Partial<GenerationMetadataInput>) {
  return generationMetadataSchema.parse({
    schema: 2,
    id: 'placeholder',
    created_at: '2026-01-01T00:00:00.000Z',
    kind: 'generate',
    prompt: 'placeholder prompt',
    requested_model: 'auto',
    model: 'gpt-image-2',
    routed: false,
    params: {
      size: '1024x1024',
      quality: 'high',
      background: 'opaque',
      output_format: 'png' as const,
      n: 1,
      moderation: 'auto' as const,
    },
    images: [{ filename: 'image-1.png', format: 'png' }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    cost: { usd: 0.01, source: 'computed' },
    latency_ms: 1000,
    ...overrides,
  } satisfies GenerationMetadataInput)
}

const lighthouse = makeEntry({
  id: 'gen-lighthouse',
  prompt: 'a lighthouse at dusk, oil painting',
  model: 'gpt-image-2',
  kind: 'generate',
  images: [{ filename: 'image-1.png', format: 'png', roles: ['final'], starred: true }],
  project_ids: ['journal-2026'],
})
const fogEdit = makeEntry({
  id: 'gen-fog-edit',
  prompt: 'add fog rolling over the harbor',
  model: 'gpt-image-1.5',
  kind: 'edit',
  images: [{ filename: 'image-1.png', format: 'png', roles: ['draft'], starred: false }],
})
const fox = makeEntry({
  id: 'gen-fox',
  prompt: 'a red fox',
  model: 'gpt-image-2',
  kind: 'generate',
  images: [{ filename: 'image-1.png', format: 'png', roles: ['icon'], starred: false }],
})

const entries = [lighthouse, fogEdit, fox]
const index = buildLibraryIndex(entries)

const BASE: LibraryFilterState = {
  scope: { type: 'all' },
  query: '',
  models: new Set(),
  kinds: new Set(),
  roles: new Set(),
}

describe('filterLibraryEntries — scope', () => {
  test('"all" returns every entry', () => {
    expect(filterLibraryEntries(index, BASE).map((e) => e.id)).toEqual(entries.map((e) => e.id))
  })

  test('"starred" returns only entries with a starred image', () => {
    const result = filterLibraryEntries(index, { ...BASE, scope: { type: 'starred' } })
    expect(result.map((e) => e.id)).toEqual(['gen-lighthouse'])
  })

  test('"project" returns only entries in that project', () => {
    const result = filterLibraryEntries(index, {
      ...BASE,
      scope: { type: 'project', slug: 'journal-2026' },
    })
    expect(result.map((e) => e.id)).toEqual(['gen-lighthouse'])
  })

  test('an unknown project scope returns nothing', () => {
    const result = filterLibraryEntries(index, {
      ...BASE,
      scope: { type: 'project', slug: 'no-such-project' },
    })
    expect(result).toEqual([])
  })
})

describe('filterLibraryEntries — search', () => {
  test('combines with scope: search narrows, scope narrows further', () => {
    const result = filterLibraryEntries(index, { ...BASE, query: 'lighthouse' })
    expect(result.map((e) => e.id)).toEqual(['gen-lighthouse'])
  })
})

describe('filterLibraryEntries — facets', () => {
  test('an empty facet set imposes no constraint', () => {
    expect(filterLibraryEntries(index, BASE)).toHaveLength(3)
  })

  test('model facet narrows to matching entries', () => {
    const result = filterLibraryEntries(index, { ...BASE, models: new Set(['gpt-image-2']) })
    expect(result.map((e) => e.id)).toEqual(['gen-lighthouse', 'gen-fox'])
  })

  test('the model facet still selects generations made with a retired model', () => {
    // The studio generates with gpt-image-2 only, but the library is a historical record:
    // entries recorded against gpt-image-1.5 must stay findable and groupable, not vanish
    // because the model left the generatable set.
    const result = filterLibraryEntries(index, { ...BASE, models: new Set(['gpt-image-1.5']) })
    expect(result.map((e) => e.id)).toEqual(['gen-fog-edit'])
  })

  test('a retired and a current model can be selected together', () => {
    const result = filterLibraryEntries(index, {
      ...BASE,
      models: new Set(['gpt-image-1.5', 'gpt-image-2']),
    })
    expect(result.map((e) => e.id)).toEqual(['gen-lighthouse', 'gen-fog-edit', 'gen-fox'])
  })

  test('kind facet narrows to matching entries', () => {
    const result = filterLibraryEntries(index, { ...BASE, kinds: new Set(['edit']) })
    expect(result.map((e) => e.id)).toEqual(['gen-fog-edit'])
  })

  test('role facet values are OR-ed within the category', () => {
    const result = filterLibraryEntries(index, {
      ...BASE,
      roles: new Set(['final', 'icon']),
    })
    expect(result.map((e) => e.id)).toEqual(['gen-lighthouse', 'gen-fox'])
  })

  test('facet categories are AND-ed together', () => {
    const result = filterLibraryEntries(index, {
      ...BASE,
      models: new Set(['gpt-image-2']),
      roles: new Set(['icon']),
    })
    expect(result.map((e) => e.id)).toEqual(['gen-fox'])
  })
})
