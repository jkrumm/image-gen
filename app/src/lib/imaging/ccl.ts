/**
 * Connected-component labeling: the shared engine behind `fillHoles`/`removeSpecks`. CCL (not
 * flood fill) because those callers need per-component AREA to distinguish wanted detail from
 * noise, which flood fill alone can't give you.
 *
 * Two-pass Rosenfeld-Pfaltz with union-find, 4-connectivity. Both passes are plain raster scans —
 * no recursion, no explicit stack needed.
 */

export type ComponentLabels = {
  readonly width: number
  readonly height: number
  /** -1 = pixel didn't match the predicate, else a component id in `[0, areas.length)`. */
  readonly labels: Int32Array
  /** Pixel count per component, indexed by component id. */
  readonly areas: number[]
}

class UnionFind {
  private readonly parent: number[] = []

  makeSet(): number {
    const id = this.parent.length
    this.parent.push(id)
    return id
  }

  find(i: number): number {
    let root = i
    while (this.parent[root] !== root) root = this.parent[root] as number
    let cur = i
    while (cur !== root) {
      const next = this.parent[cur] as number
      this.parent[cur] = root
      cur = next
    }
    return root
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    if (ra < rb) this.parent[rb] = ra
    else this.parent[ra] = rb
  }
}

export function labelComponents(
  width: number,
  height: number,
  predicate: (x: number, y: number) => boolean,
): ComponentLabels {
  const provisional = new Int32Array(width * height).fill(-1)
  const uf = new UnionFind()

  // Pass 1: assign provisional labels, union west/north neighbors that also match.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!predicate(x, y)) continue
      const i = y * width + x
      const west = x > 0 ? (provisional[i - 1] ?? -1) : -1
      const north = y > 0 ? (provisional[i - width] ?? -1) : -1

      if (west === -1 && north === -1) {
        provisional[i] = uf.makeSet()
      } else if (west !== -1 && north === -1) {
        provisional[i] = west
      } else if (west === -1 && north !== -1) {
        provisional[i] = north
      } else {
        provisional[i] = west
        uf.union(west, north)
      }
    }
  }

  // Pass 2: resolve to canonical roots, then renumber to consecutive ids and count areas.
  const rootToId = new Map<number, number>()
  const labels = new Int32Array(width * height).fill(-1)
  const areas: number[] = []

  for (let i = 0; i < provisional.length; i++) {
    const provisionalLabel = provisional[i] ?? -1
    if (provisionalLabel === -1) continue

    const root = uf.find(provisionalLabel)
    let id = rootToId.get(root)
    if (id === undefined) {
      id = areas.length
      rootToId.set(root, id)
      areas.push(0)
    }

    labels[i] = id
    areas[id] = (areas[id] ?? 0) + 1
  }

  return { width, height, labels, areas }
}
