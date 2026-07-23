import { describe, expect, test } from 'bun:test'
import { buildLibraryIndex } from './library-index'
import {
  generationMetadataSchema,
  type GenerationMetadata,
  type GenerationMetadataInput,
} from './metadata'

const BASE_PARAMS = {
  size: '1024x1024',
  quality: 'high',
  background: 'opaque',
  output_format: 'png' as const,
  n: 1,
  moderation: 'auto' as const,
}

/** Builds a fully-resolved `GenerationMetadata` (defaults included) from a partial input, mirroring
 * the shape `library.ts` writes. Fixtures are built through the real schema rather than hand-typed
 * literals so this test can't drift from what `generationMetadataSchema` actually produces. */
function makeEntry(overrides: Partial<GenerationMetadataInput>): GenerationMetadata {
  return generationMetadataSchema.parse({
    schema: 2,
    id: '2026-01-01_00-00-00_0000',
    created_at: '2026-01-01T00:00:00.000Z',
    kind: 'generate',
    prompt: 'a placeholder prompt',
    requested_model: 'auto',
    model: 'gpt-image-2',
    routed: false,
    params: BASE_PARAMS,
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
  parent: { id: 'gen-lighthouse', op: 'edit' },
  images: [{ filename: 'image-1.png', format: 'png', roles: ['draft'], starred: false }],
})

const fox = makeEntry({
  id: 'gen-fox',
  prompt: 'a red fox',
  model: 'gpt-image-2',
  kind: 'generate',
  enhance: {
    brief: 'fox running in the snow',
    intent: 'painterly',
    mode_applied: 'full',
    plan_prompt: 'a red fox',
    final_prompt_edited: false,
    playbook_version: '1',
    enhance_model: 'gpt-5.6',
  },
})

const iconChild = makeEntry({
  id: 'gen-icon-child',
  prompt: 'lighthouse icon, flat design',
  model: 'gpt-image-1.5',
  kind: 'edit',
  parent: { id: 'gen-fog-edit' },
  images: [{ filename: 'image-1.png', format: 'png', roles: ['icon'], starred: true }],
  project_ids: ['journal-2026'],
})

const entries = [lighthouse, fogEdit, fox, iconChild]

describe('buildLibraryIndex — search', () => {
  test('matches on prompt, case-insensitively', () => {
    const index = buildLibraryIndex(entries)
    expect(index.search('LIGHTHOUSE').map((e) => e.id)).toEqual([
      'gen-lighthouse',
      'gen-icon-child',
    ])
  })

  test('matches on enhance.brief when prompt does not contain the query', () => {
    const index = buildLibraryIndex(entries)
    expect(index.search('snow').map((e) => e.id)).toEqual(['gen-fox'])
  })

  test('an empty or whitespace query returns every entry, unfiltered', () => {
    const index = buildLibraryIndex(entries)
    expect(index.search('').map((e) => e.id)).toEqual(entries.map((e) => e.id))
    expect(index.search('   ').map((e) => e.id)).toEqual(entries.map((e) => e.id))
  })

  test('an entry with no enhance record is never matched by brief text', () => {
    const index = buildLibraryIndex(entries)
    expect(index.search('rolling over the harbor').map((e) => e.id)).toEqual(['gen-fog-edit'])
  })
})

describe('buildLibraryIndex — facets', () => {
  test('model facet counts every distinct model', () => {
    const index = buildLibraryIndex(entries)
    expect(index.facets.model).toEqual([
      { value: 'gpt-image-1.5', count: 2 },
      { value: 'gpt-image-2', count: 2 },
    ])
  })

  test('kind facet counts generate vs edit', () => {
    const index = buildLibraryIndex(entries)
    expect(index.facets.kind).toEqual([
      { value: 'edit', count: 2 },
      { value: 'generate', count: 2 },
    ])
  })

  test('role facet only counts roles actually present on images', () => {
    const index = buildLibraryIndex(entries)
    expect(index.facets.role).toEqual([
      { value: 'draft', count: 1 },
      { value: 'final', count: 1 },
      { value: 'icon', count: 1 },
    ])
  })

  test('project facet counts project_ids membership', () => {
    const index = buildLibraryIndex(entries)
    expect(index.facets.project).toEqual([{ value: 'journal-2026', count: 2 }])
  })
})

describe('buildLibraryIndex — starred and filters', () => {
  test('starred lists only entries with at least one starred image', () => {
    const index = buildLibraryIndex(entries)
    expect(index.starred.map((e) => e.id)).toEqual(['gen-lighthouse', 'gen-icon-child'])
  })

  test('byModel/byKind/byRole/byProject filter to the matching entries', () => {
    const index = buildLibraryIndex(entries)
    expect(index.byModel('gpt-image-2').map((e) => e.id)).toEqual(['gen-lighthouse', 'gen-fox'])
    expect(index.byKind('edit').map((e) => e.id)).toEqual(['gen-fog-edit', 'gen-icon-child'])
    expect(index.byRole('icon').map((e) => e.id)).toEqual(['gen-icon-child'])
    expect(index.byProject('journal-2026').map((e) => e.id)).toEqual([
      'gen-lighthouse',
      'gen-icon-child',
    ])
  })

  test('an unknown facet value returns an empty list, not undefined', () => {
    const index = buildLibraryIndex(entries)
    expect(index.byModel('gpt-image-mini')).toEqual([])
    expect(index.byProject('unknown-project')).toEqual([])
  })
})

describe('buildLibraryIndex — reverse lineage', () => {
  test('childrenOf returns direct children only, walking one level of parent.id', () => {
    const index = buildLibraryIndex(entries)
    expect(index.childrenOf('gen-lighthouse').map((e) => e.id)).toEqual(['gen-fog-edit'])
    expect(index.childrenOf('gen-fog-edit').map((e) => e.id)).toEqual(['gen-icon-child'])
  })

  test('an id with no children returns an empty list', () => {
    const index = buildLibraryIndex(entries)
    expect(index.childrenOf('gen-icon-child')).toEqual([])
    expect(index.childrenOf('unknown-id')).toEqual([])
  })
})
