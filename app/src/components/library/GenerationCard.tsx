import { convertFileSrc } from '@tauri-apps/api/core'
import { Badge, Card, Group, Skeleton, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { absolutePath, type LibraryEntry } from '../../lib/library'

function useThumbnailSrc(entry: LibraryEntry): string | null {
  const [src, setSrc] = useState<string | null>(null)
  const firstImage = entry.metadata.images[0]

  useEffect(() => {
    setSrc(null)
    if (!firstImage) return
    let cancelled = false
    void absolutePath(entry.metadata.id, firstImage.filename).then((path) => {
      return cancelled ? undefined : setSrc(convertFileSrc(path))
    })
    return () => {
      cancelled = true
    }
  }, [entry.metadata.id, firstImage])

  return src
}

type GenerationCardProps = {
  entry: LibraryEntry
  onOpen: () => void
}

/** One grid tile in the Library. */
export function GenerationCard({ entry, onOpen }: GenerationCardProps) {
  const thumbnailSrc = useThumbnailSrc(entry)
  const { metadata } = entry
  const starred = metadata.images.some((image) => image.starred)

  return (
    <Card withBorder padding="sm" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <Card.Section pos="relative">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={metadata.prompt}
            style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Skeleton height={160} />
        )}
        {starred && (
          <Badge
            size="sm"
            variant="filled"
            color="yellow"
            style={{ position: 'absolute', top: 6, right: 6 }}
          >
            ★
          </Badge>
        )}
      </Card.Section>
      <Stack gap={4} mt="xs">
        <Text size="sm" lineClamp={2}>
          {metadata.prompt}
        </Text>
        <Group justify="space-between">
          <Group gap={4}>
            <Badge size="sm" variant="light">
              {metadata.model}
            </Badge>
            {metadata.kind === 'edit' && (
              <Badge size="sm" variant="outline" color="grape">
                edit
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {metadata.cost.usd !== null ? `$${metadata.cost.usd.toFixed(4)}` : 'n/a'}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {new Date(metadata.created_at).toLocaleString()}
        </Text>
      </Stack>
    </Card>
  )
}
