import { describe, expect, test } from 'bun:test'
import { ancestorChain, groupChildrenByOp } from './lineage'
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

const root = makeEntry({ id: 'gen-root', prompt: 'a lighthouse' })
const tweak = makeEntry({
  id: 'gen-tweak',
  prompt: 'a lighthouse, oil painting',
  parent: { id: 'gen-root', op: 'tweak' },
})
const promote = makeEntry({
  id: 'gen-promote',
  prompt: 'a lighthouse, oil painting',
  parent: { id: 'gen-tweak', op: 'promote' },
})

const byId = new Map([root, tweak, promote].map((e) => [e.id, e]))

describe('ancestorChain', () => {
  test('a root generation (no parent) has an empty chain', () => {
    expect(ancestorChain(root, byId)).toEqual([])
  })

  test('walks parent.id upward, nearest ancestor first', () => {
    expect(ancestorChain(promote, byId)).toEqual([
      { id: 'gen-tweak', prompt: 'a lighthouse, oil painting', op: 'promote' },
      { id: 'gen-root', prompt: 'a lighthouse', op: 'tweak' },
    ])
  })

  test('an ancestor missing from the index yields a placeholder prompt and stops the walk', () => {
    const orphan = makeEntry({ id: 'gen-orphan', parent: { id: 'gen-deleted', op: 'rerun' } })
    expect(ancestorChain(orphan, byId)).toEqual([
      { id: 'gen-deleted', prompt: '(not in library)', op: 'rerun' },
    ])
  })

  test('a self-referential parent (corrupt sidecar) does not infinite-loop', () => {
    const cyclic = makeEntry({ id: 'gen-cyclic', parent: { id: 'gen-cyclic', op: 'edit' } })
    const cyclicById = new Map([...byId, [cyclic.id, cyclic]] as const)
    expect(ancestorChain(cyclic, cyclicById)).toEqual([])
  })

  test('a parent with no recorded op omits it rather than inventing one', () => {
    const bare = makeEntry({ id: 'gen-bare', parent: { id: 'gen-root' } })
    expect(ancestorChain(bare, byId)).toEqual([{ id: 'gen-root', prompt: 'a lighthouse' }])
  })
})

describe('groupChildrenByOp', () => {
  test('groups children by their recorded parent.op', () => {
    const edit = makeEntry({ id: 'gen-edit', parent: { id: 'gen-root', op: 'edit' } })
    const groups = groupChildrenByOp([tweak, edit, promote])
    expect(groups.map((g) => g.op)).toEqual(['tweak', 'edit', 'promote'])
    expect(groups[0]?.children.map((c) => c.id)).toEqual(['gen-tweak'])
  })

  test('children with no recorded op bucket under "unknown"', () => {
    const bare = makeEntry({ id: 'gen-bare', parent: { id: 'gen-root' } })
    const groups = groupChildrenByOp([bare])
    expect(groups).toEqual([{ op: 'unknown', children: [bare] }])
  })

  test('an empty list groups to nothing', () => {
    expect(groupChildrenByOp([])).toEqual([])
  })
})
