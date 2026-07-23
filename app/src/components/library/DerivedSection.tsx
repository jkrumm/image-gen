import { convertFileSrc } from '@tauri-apps/api/core'
import {
  Button,
  Card,
  CopyButton,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import type { Recipe } from '../../lib/imaging/recipe'
import { absolutePath } from '../../lib/library'
import type { GenerationDerivative } from '../../lib/metadata'

/** One tile in the "Derived" section: either a single exported file, or — when several
 * derivatives share a top-level folder (e.g. `icon.iconset/*.png`) — a collapsed group showing a
 * representative thumbnail plus a file count instead of one tile per file. */
type DerivativeGroup = {
  key: string
  items: GenerationDerivative[]
}

/** Groups derivatives by the top-level folder in their filename (the part before the first `/`);
 * a derivative with no `/` is its own single-item group keyed by its own filename. */
function groupDerivatives(derivatives: GenerationDerivative[]): DerivativeGroup[] {
  const groups: DerivativeGroup[] = []
  const indexByKey = new Map<string, number>()

  for (const derivative of derivatives) {
    const slashIndex = derivative.filename.indexOf('/')
    const key = slashIndex === -1 ? derivative.filename : derivative.filename.slice(0, slashIndex)
    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      groups[existingIndex]?.items.push(derivative)
      continue
    }
    indexByKey.set(key, groups.length)
    groups.push({ key, items: [derivative] })
  }

  return groups
}

function useDerivativeThumbnailSrc(
  generationId: string,
  filename: string | undefined,
): string | null {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    setSrc(null)
    if (!filename) return
    let cancelled = false
    void absolutePath(generationId, `derived/${filename}`).then((path) => {
      return cancelled ? undefined : setSrc(convertFileSrc(path))
    })
    return () => {
      cancelled = true
    }
  }, [generationId, filename])

  return src
}

type DerivativeGroupTileProps = {
  generationId: string
  group: DerivativeGroup
  refining: boolean
  onRefineAgain: (recipe: Recipe | undefined) => void
}

function DerivativeGroupTile({
  generationId,
  group,
  refining,
  onRefineAgain,
}: DerivativeGroupTileProps) {
  const [representative] = group.items
  const thumbnailSrc = useDerivativeThumbnailSrc(generationId, representative?.filename)
  const isFolder = group.items.length > 1
  const isIconset = isFolder && group.key.endsWith('.iconset')
  const [finishPath, setFinishPath] = useState<string | null>(null)

  useEffect(() => {
    setFinishPath(null)
    if (!isIconset) return
    let cancelled = false
    void absolutePath(generationId, `derived/${group.key}`).then((path) => {
      return cancelled ? undefined : setFinishPath(path)
    })
    return () => {
      cancelled = true
    }
  }, [generationId, group.key, isIconset])

  if (!representative) return null

  const title = isFolder ? group.key : (representative.label ?? representative.filename)

  return (
    <Card withBorder padding="sm">
      <Card.Section>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={title}
            style={{
              width: '100%',
              height: 100,
              objectFit: 'contain',
              display: 'block',
              background: 'var(--vx-surface-2, transparent)',
            }}
          />
        ) : (
          <Skeleton height={100} />
        )}
      </Card.Section>
      <Stack gap={2} mt="xs">
        <Text size="xs" fw={500} lineClamp={1}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {isFolder
            ? `${group.items.length} files`
            : `${representative.width}×${representative.height}`}
        </Text>
        {finishPath && (
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Finish with:
            </Text>
            <Group gap={4} wrap="nowrap">
              <Text size="xs" ff="monospace" lineClamp={1} style={{ flex: 1 }}>
                iconutil -c icns &quot;{finishPath}&quot;
              </Text>
              <CopyButton value={`iconutil -c icns "${finishPath}"`}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied' : 'Copy command'}>
                    <Button size="xs" variant="subtle" px={4} onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Stack>
        )}
        <Button
          size="xs"
          variant="default"
          loading={refining}
          onClick={() => onRefineAgain(representative.recipe)}
        >
          Refine again
        </Button>
      </Stack>
    </Card>
  )
}

type DerivedSectionProps = {
  generationId: string
  derivatives: GenerationDerivative[] | undefined
  refiningKey: string | null
  onRefineAgain: (key: string, recipe: Recipe | undefined) => void
}

/** Baked Refine exports for a generation (macOS iconset, favicon set, single PNG, …), grouped by
 * top-level folder. Renders nothing when there are none. */
export function DerivedSection({
  generationId,
  derivatives,
  refiningKey,
  onRefineAgain,
}: DerivedSectionProps) {
  if (!derivatives || derivatives.length === 0) return null

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Derived
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        {groupDerivatives(derivatives).map((group) => (
          <DerivativeGroupTile
            key={group.key}
            generationId={generationId}
            group={group}
            refining={refiningKey === group.key}
            onRefineAgain={(recipe) => onRefineAgain(group.key, recipe)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  )
}
