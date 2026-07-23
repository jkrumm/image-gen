/**
 * Pure lineage-walking for the inspector's Lineage panel (docs/concept.md §2: "ancestor breadcrumb
 * + children grouped by operation... a clickable list, not a graph canvas"). Reverse-lineage
 * (children) is already covered by `library-index.ts#childrenOf` — this module only adds the
 * ancestor walk and the op-grouping on top of it, without touching that file.
 */
import type { GenerationMetadata } from './metadata'

export type LineageAncestor = {
  id: string
  /** The ancestor's own prompt, or a placeholder when the ancestor is no longer in the index
   * (deleted from disk, or its sidecar failed to parse). */
  prompt: string
  /** The operation that produced the *next* generation down the chain (i.e. `child.parent.op`),
   * carried on the ancestor entry so a breadcrumb can render "tweak ->" between two nodes. */
  op?: string
}

/**
 * Walks `parent.id` upward from `entry`, nearest ancestor first. Stops at the first id already
 * visited (a real chain is a straight line back to a root with no parent; a cycle should never
 * occur in real data, but a corrupt sidecar must not hang the UI) or at the first ancestor missing
 * from `byId` (recorded but no longer in the library — the walk still yields that id with a
 * placeholder prompt, then stops, since a missing entry carries no further `parent` to follow).
 */
export function ancestorChain(
  entry: GenerationMetadata,
  byId: ReadonlyMap<string, GenerationMetadata>,
): LineageAncestor[] {
  const chain: LineageAncestor[] = []
  const visited = new Set<string>([entry.id])
  let link = entry.parent

  while (link) {
    if (visited.has(link.id)) break
    visited.add(link.id)
    const ancestor = byId.get(link.id)
    chain.push({
      id: link.id,
      prompt: ancestor?.prompt ?? '(not in library)',
      ...(link.op !== undefined ? { op: link.op } : {}),
    })
    link = ancestor?.parent
  }

  return chain
}

export type ChildGroup = { op: string; children: GenerationMetadata[] }

/** Groups a list of direct children (e.g. from `library-index.ts#childrenOf`) by the operation
 * recorded on each child's `parent.op`. Children with no recorded op (legacy sidecars, or a bare
 * `{ id }` parent) bucket under `'unknown'` rather than being silently dropped. Group order
 * follows first-encountered-op, not alphabetical, to match `children`'s own (chronological) order. */
export function groupChildrenByOp(children: GenerationMetadata[]): ChildGroup[] {
  const groups = new Map<string, GenerationMetadata[]>()
  for (const child of children) {
    const op = child.parent?.op ?? 'unknown'
    const bucket = groups.get(op)
    if (bucket) bucket.push(child)
    else groups.set(op, [child])
  }
  return [...groups.entries()].map(([op, group]) => ({ op, children: group }))
}
