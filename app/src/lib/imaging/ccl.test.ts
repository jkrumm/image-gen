import { describe, expect, test } from 'bun:test'
import { labelComponents } from './ccl'

describe('labelComponents', () => {
  test('labels two disconnected blobs separately with correct areas', () => {
    // 5x5 grid, two 2x2 blobs in opposite corners.
    const on = new Set(['0,0', '1,0', '0,1', '1,1', '3,3', '4,3', '3,4', '4,4'])
    const { labels, areas } = labelComponents(5, 5, (x, y) => on.has(`${x},${y}`))

    expect(areas.length).toBe(2)
    expect(areas).toEqual([4, 4])

    const labelAt = (x: number, y: number) => labels[y * 5 + x]
    expect(labelAt(0, 0)).toBe(labelAt(1, 1))
    expect(labelAt(3, 3)).toBe(labelAt(4, 4))
    expect(labelAt(0, 0)).not.toBe(labelAt(3, 3))
    expect(labelAt(2, 2)).toBe(-1)
  })

  test('merges an L-shape into a single component via union-find', () => {
    // An L-shape where the two "arms" are only discovered to be connected once the corner is
    // reached — exercises the union step.
    const on = new Set(['0,0', '0,1', '0,2', '1,2', '2,2'])
    const { labels, areas } = labelComponents(3, 3, (x, y) => on.has(`${x},${y}`))
    expect(areas).toEqual([5])
    const labelAt = (x: number, y: number) => labels[y * 3 + x]
    expect(labelAt(0, 0)).toBe(labelAt(2, 2))
  })

  test('empty predicate produces no components', () => {
    const { areas } = labelComponents(4, 4, () => false)
    expect(areas).toEqual([])
  })
})
