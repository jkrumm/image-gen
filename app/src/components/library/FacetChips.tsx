import { Badge, Group, Text } from '@mantine/core'
import type { FacetBucket } from '../../lib/library-index'

type FacetRowProps = {
  label: string
  buckets: FacetBucket[]
  active: ReadonlySet<string>
  onToggle: (value: string) => void
}

function FacetRow({ label, buckets, active, onToggle }: FacetRowProps) {
  if (buckets.length === 0) return null

  return (
    <Group gap={6} wrap="wrap" align="center">
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      {buckets.map((bucket) => (
        <Badge
          key={bucket.value}
          variant={active.has(bucket.value) ? 'filled' : 'light'}
          style={{ cursor: 'pointer' }}
          onClick={() => onToggle(bucket.value)}
        >
          {bucket.value} · {bucket.count}
        </Badge>
      ))}
    </Group>
  )
}

export type FacetChipsProps = {
  modelFacets: FacetBucket[]
  kindFacets: FacetBucket[]
  roleFacets: FacetBucket[]
  activeModels: ReadonlySet<string>
  activeKinds: ReadonlySet<string>
  activeRoles: ReadonlySet<string>
  onToggleModel: (value: string) => void
  onToggleKind: (value: string) => void
  onToggleRole: (value: string) => void
}

/** Clickable facet-chip rows over `buildLibraryIndex(...).facets` (docs/concept.md §2: "filter by
 * role/star/project/kind/model"). Project is covered by the sidebar scope, not a chip here — see
 * `LibrarySidebar`. Each chip toggles membership in its category's active set; `library-filters.ts`
 * does the actual OR-within/AND-across combination. */
export function FacetChips({
  modelFacets,
  kindFacets,
  roleFacets,
  activeModels,
  activeKinds,
  activeRoles,
  onToggleModel,
  onToggleKind,
  onToggleRole,
}: FacetChipsProps) {
  return (
    <Group gap="md" wrap="wrap">
      <FacetRow
        label="Model"
        buckets={modelFacets}
        active={activeModels}
        onToggle={onToggleModel}
      />
      <FacetRow label="Kind" buckets={kindFacets} active={activeKinds} onToggle={onToggleKind} />
      <FacetRow label="Role" buckets={roleFacets} active={activeRoles} onToggle={onToggleRole} />
    </Group>
  )
}
