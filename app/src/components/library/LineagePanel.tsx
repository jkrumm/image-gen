import { Badge, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { ancestorChain, groupChildrenByOp } from '../../lib/lineage'
import type { GenerationMetadata } from '../../lib/metadata'

type LineageRowProps = {
  label: string
  op?: string
  onOpen: () => void
}

function LineageRow({ label, op, onOpen }: LineageRowProps) {
  return (
    <UnstyledButton onClick={onOpen} style={{ display: 'block', width: '100%' }}>
      <Group gap={6} wrap="nowrap" py={2}>
        {op && (
          <Badge size="xs" variant="light">
            {op}
          </Badge>
        )}
        <Text size="xs" lineClamp={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  )
}

type LineagePanelProps = {
  entry: GenerationMetadata
  byId: ReadonlyMap<string, GenerationMetadata>
  childGenerations: GenerationMetadata[]
  onOpenGeneration: (id: string) => void
}

/**
 * Lineage panel (docs/concept.md §2): ancestor breadcrumb (walking `parent.id` upward) + children
 * grouped by the operation that produced each one. A clickable list, not a graph canvas — chains
 * are almost always linear. Renders nothing when there is no lineage at all (no ancestors, no
 * children) rather than empty scaffolding.
 */
export function LineagePanel({
  entry,
  byId,
  childGenerations,
  onOpenGeneration,
}: LineagePanelProps) {
  const ancestors = ancestorChain(entry, byId)
  const childGroups = groupChildrenByOp(childGenerations)

  if (ancestors.length === 0 && childGroups.length === 0) return null

  return (
    <Stack gap={8}>
      <Text size="sm" fw={500}>
        Lineage
      </Text>

      {ancestors.length > 0 && (
        <Stack gap={0}>
          <Text size="xs" c="dimmed" fw={500}>
            Ancestors
          </Text>
          {ancestors.map((ancestor) => (
            <LineageRow
              key={ancestor.id}
              label={ancestor.prompt}
              {...(ancestor.op !== undefined ? { op: ancestor.op } : {})}
              onOpen={() => onOpenGeneration(ancestor.id)}
            />
          ))}
        </Stack>
      )}

      {childGroups.map((group) => (
        <Stack key={group.op} gap={0}>
          <Text size="xs" c="dimmed" fw={500}>
            {group.op} ({group.children.length})
          </Text>
          {group.children.map((child) => (
            <LineageRow
              key={child.id}
              label={child.prompt}
              onOpen={() => onOpenGeneration(child.id)}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
