/**
 * Combines the Library surface's sidebar scope + search box + facet chips into the entries a grid
 * should render. Built entirely on top of `library-index.ts`'s public `LibraryIndex` (search,
 * facets, `starred`, `byProject`) — this module is new, `library-index.ts` is untouched (out of
 * ownership this wave). Pure and synchronous, unit-testable without a Tauri runtime.
 */
import type { GenerationMetadata } from './metadata'
import type { LibraryIndex } from './library-index'

/** Sidebar scope (docs/concept.md §2: "All (append-only history) / Starred / Projects"). */
export type LibraryScope = { type: 'all' } | { type: 'starred' } | { type: 'project'; slug: string }

export type LibraryFilterState = {
  scope: LibraryScope
  query: string
  models: ReadonlySet<string>
  kinds: ReadonlySet<string>
  roles: ReadonlySet<string>
}

function scopeEntries(index: LibraryIndex, scope: LibraryScope): GenerationMetadata[] {
  if (scope.type === 'starred') return index.starred
  if (scope.type === 'project') return index.byProject(scope.slug)
  return index.entries
}

/**
 * Applies scope, then search, then facet chips. Facet values within one category (e.g. two
 * selected roles) are OR'd — an entry matches if it has *any* selected role; categories
 * (model/kind/role) are AND'd together. An empty facet set imposes no constraint on that
 * category, matching a filter-chip UI with nothing toggled on.
 */
export function filterLibraryEntries(
  index: LibraryIndex,
  filters: LibraryFilterState,
): GenerationMetadata[] {
  const scopedIds = new Set(scopeEntries(index, filters.scope).map((entry) => entry.id))

  return index.search(filters.query).filter((entry) => {
    if (!scopedIds.has(entry.id)) return false
    if (filters.models.size > 0 && !filters.models.has(entry.model)) return false
    if (filters.kinds.size > 0 && !filters.kinds.has(entry.kind)) return false
    if (filters.roles.size > 0) {
      const entryRoles = new Set<string>(entry.images.flatMap((image) => image.roles))
      if (![...filters.roles].some((role) => entryRoles.has(role))) return false
    }
    return true
  })
}
