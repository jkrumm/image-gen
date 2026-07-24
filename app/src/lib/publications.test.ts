import { describe, expect, test } from 'bun:test'
import type { GenerationPublication } from '@image-gen/shared'
import { findPublication, withPublication } from './publications'

const SHARED: GenerationPublication = {
  target: 'image-share',
  image_share_id: 42,
  published_at: '2026-07-24T10:00:00.000Z',
}

const PUBLISHED: GenerationPublication = {
  target: 'image-share',
  image_share_id: 42,
  published_key: 'gen/ab12cd34.png',
  cdn_url: 'https://img.jkrumm.com/gen/ab12cd34.png',
  published_at: '2026-07-24T10:05:00.000Z',
}

describe('findPublication', () => {
  test('returns undefined when there are no publications yet', () => {
    expect(findPublication(undefined, 'image-share')).toBeUndefined()
  })

  test('finds the record matching the target', () => {
    expect(findPublication([SHARED], 'image-share')).toEqual(SHARED)
  })
})

describe('withPublication', () => {
  test('appends a publication to an empty/absent list', () => {
    expect(withPublication(undefined, SHARED)).toEqual([SHARED])
  })

  test('round-trips share then publish for the same target — upserts in place, never appends a duplicate', () => {
    const afterShare = withPublication(undefined, SHARED)
    const afterPublish = withPublication(afterShare, PUBLISHED)
    expect(afterPublish).toEqual([PUBLISHED])
  })

  test('does not mutate the input array', () => {
    const original = [SHARED]
    withPublication(original, PUBLISHED)
    expect(original).toEqual([SHARED])
  })
})
