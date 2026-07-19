import type { GenerateRequestInput } from '@image-gen/shared'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { error as logError } from '@tauri-apps/plugin-log'
import { readFile } from '@tauri-apps/plugin-fs'
import { EmptyState } from 'basalt-ui'
import { useEffect, useState } from 'react'
import type { ComposerSeed, EditorSeed, RefineSeed } from '../App'
import type { Recipe } from '../lib/imaging/recipe'
import { absolutePath, type LibraryEntry } from '../lib/library'
import type { GenerationDerivative, GenerationImageMeta, GenerationMetadata } from '../lib/metadata'

/** Maps a saved image's on-disk format back to a MIME type for constructing a `File`. */
function mimeTypeForFormat(format: GenerationImageMeta['format']): string {
  if (format === 'png') return 'image/png'
  if (format === 'webp') return 'image/webp'
  return 'image/jpeg'
}

type LibraryProps = {
  entries: LibraryEntry[]
  totalCost: number
  onSeedComposer: (seed: ComposerSeed) => void
  onSeedEditor: (seed: EditorSeed) => void
  onSeedRefine: (seed: RefineSeed) => void
}

export function Library({
  entries,
  totalCost,
  onSeedComposer,
  onSeedEditor,
  onSeedRefine,
}: LibraryProps) {
  const [selected, setSelected] = useState<LibraryEntry | null>(null)

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No generations yet"
        description="Generations you create in Compose are saved here automatically."
      />
    )
  }

  return (
    <Stack gap="lg" p="lg">
      <Group justify="space-between">
        <Title order={5}>Library</Title>
        <Text size="sm" c="dimmed">
          {entries.length} generations · ${totalCost.toFixed(2)}
        </Text>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="md">
        {entries.map((entry) => (
          <GenerationCard key={entry.metadata.id} entry={entry} onOpen={() => setSelected(entry)} />
        ))}
      </SimpleGrid>

      {selected && (
        <GenerationDetail
          entry={selected}
          onClose={() => setSelected(null)}
          onSeedComposer={(seed) => {
            setSelected(null)
            onSeedComposer(seed)
          }}
          onSeedEditor={(seed) => {
            setSelected(null)
            onSeedEditor(seed)
          }}
          onSeedRefine={(seed) => {
            setSelected(null)
            onSeedRefine(seed)
          }}
        />
      )}
    </Stack>
  )
}

function toComposerRequest(metadata: GenerationMetadata): GenerateRequestInput {
  return {
    prompt: metadata.prompt,
    model: metadata.model,
    size: metadata.params.size,
    // quality/background were stored from the gateway's resolved response (a plain string) —
    // cast back to the request enum; the composer's own SegmentedControl data covers this range.
    quality: metadata.params.quality as GenerateRequestInput['quality'],
    background: metadata.params.background as GenerateRequestInput['background'],
    output_format: metadata.params.output_format,
    ...(metadata.params.output_compression !== undefined
      ? { output_compression: metadata.params.output_compression }
      : {}),
    n: metadata.params.n,
    moderation: metadata.params.moderation,
  }
}

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

type GenerationCardProps = {
  entry: LibraryEntry
  onOpen: () => void
}

function GenerationCard({ entry, onOpen }: GenerationCardProps) {
  const thumbnailSrc = useThumbnailSrc(entry)
  const { metadata } = entry

  return (
    <Card withBorder padding="sm" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <Card.Section>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={metadata.prompt}
            style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Skeleton height={160} />
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

type GenerationDetailProps = {
  entry: LibraryEntry
  onClose: () => void
  onSeedComposer: (seed: ComposerSeed) => void
  onSeedEditor: (seed: EditorSeed) => void
  onSeedRefine: (seed: RefineSeed) => void
}

function GenerationDetail({
  entry,
  onClose,
  onSeedComposer,
  onSeedEditor,
  onSeedRefine,
}: GenerationDetailProps) {
  const { metadata } = entry
  const [imageSrcs, setImageSrcs] = useState<string[]>([])
  const [iterating, setIterating] = useState(false)
  // Which "open in Refine" trigger is in flight: 'main' for the detail's own Refine button, or a
  // derivative group's key for its "Refine again" button — so only the clicked button spins.
  const [openingKey, setOpeningKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      metadata.images.map((image) => absolutePath(metadata.id, image.filename)),
    ).then((paths) => {
      return cancelled ? undefined : setImageSrcs(paths.map((path) => convertFileSrc(path)))
    })
    return () => {
      cancelled = true
    }
  }, [metadata.id, metadata.images])

  function seed(): void {
    onSeedComposer({ request: toComposerRequest(metadata), parentId: metadata.id })
  }

  /** Loads this generation's first output image from disk and seeds it as edit reference image 1. */
  async function iterate(): Promise<void> {
    const firstImage = metadata.images[0]
    if (!firstImage) return

    setIterating(true)
    try {
      const path = await absolutePath(metadata.id, firstImage.filename)
      const bytes = await readFile(path)
      const file = new File([bytes], firstImage.filename, {
        type: mimeTypeForFormat(firstImage.format),
      })
      onSeedEditor({ image: file, parentId: metadata.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void logError(`failed to load image for editing: ${message}`)
      notifications.show({ color: 'red', title: 'Could not load image', message })
    } finally {
      setIterating(false)
    }
  }

  /** Loads this generation's first output image from disk and seeds it into the Refine
   * workbench, alongside the generation id exports get written back under. `key` identifies which
   * button triggered this (for the per-button loading state); an optional `recipe` reopens the
   * workbench with a previously exported derivative's saved recipe instead of defaults. */
  async function openInRefine(key: string, recipe?: Recipe): Promise<void> {
    const firstImage = metadata.images[0]
    if (!firstImage) return

    setOpeningKey(key)
    try {
      const path = await absolutePath(metadata.id, firstImage.filename)
      const bytes = await readFile(path)
      const file = new File([bytes], firstImage.filename, {
        type: mimeTypeForFormat(firstImage.format),
      })
      onSeedRefine({
        generationId: metadata.id,
        image: file,
        ...(recipe !== undefined ? { recipe } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void logError(`failed to load image for refine: ${message}`)
      notifications.show({ color: 'red', title: 'Could not load image', message })
    } finally {
      setOpeningKey(null)
    }
  }

  return (
    <Modal opened onClose={onClose} title="Generation" size="lg">
      <Stack gap="md">
        <Group gap="md" wrap="wrap">
          {imageSrcs.length > 0
            ? imageSrcs.map((src, index) => (
                <img
                  // eslint-disable-next-line react/no-array-index-key -- images have no stable id
                  key={index}
                  src={src}
                  alt={`${metadata.prompt} ${index + 1}`}
                  style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8 }}
                />
              ))
            : metadata.images.map((image) => (
                <Skeleton key={image.filename} height={200} width={200} />
              ))}
        </Group>

        <Group justify="space-between" align="flex-start">
          <Text size="sm" style={{ flex: 1 }}>
            {metadata.prompt}
          </Text>
          <CopyButton value={metadata.prompt}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy prompt'}>
                <Button size="xs" variant="subtle" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Badge variant="light">{metadata.model}</Badge>
          <Badge variant="light">{metadata.params.size}</Badge>
          <Badge variant="light">{metadata.params.quality}</Badge>
          <Badge variant="light">{metadata.params.background}</Badge>
          <Badge variant="light">{metadata.params.output_format}</Badge>
          <Badge variant="outline" {...(metadata.kind === 'edit' ? { color: 'grape' } : {})}>
            {metadata.kind}
          </Badge>
          {metadata.kind === 'edit' && metadata.input_images && (
            <Badge variant="outline">
              {metadata.input_images.length} input{metadata.input_images.length === 1 ? '' : 's'}
            </Badge>
          )}
          {metadata.mask && <Badge variant="outline">masked</Badge>}
          {metadata.routed && (
            <Tooltip label={metadata.routing_reason ?? 'Model routed automatically'}>
              <Badge color="orange" variant="light">
                routed
              </Badge>
            </Tooltip>
          )}
        </Group>

        <Group gap="lg">
          <Text size="sm" c="dimmed">
            Cost: {metadata.cost.usd !== null ? `$${metadata.cost.usd.toFixed(4)}` : 'n/a'}
          </Text>
          <Text size="sm" c="dimmed">
            Tokens: {metadata.usage.total_tokens}
          </Text>
          <Text size="sm" c="dimmed">
            Latency: {metadata.latency_ms}ms
          </Text>
          <Text size="sm" c="dimmed">
            {new Date(metadata.created_at).toLocaleString()}
          </Text>
        </Group>

        {metadata.derivatives && metadata.derivatives.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Derived
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
              {groupDerivatives(metadata.derivatives).map((group) => (
                <DerivativeGroupTile
                  key={group.key}
                  generationId={metadata.id}
                  group={group}
                  refining={openingKey === group.key}
                  onRefineAgain={(recipe) => void openInRefine(group.key, recipe)}
                />
              ))}
            </SimpleGrid>
          </Stack>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={() => void openInRefine('main')}
            loading={openingKey === 'main'}
          >
            Refine
          </Button>
          <Button variant="default" onClick={() => void iterate()} loading={iterating}>
            Use as edit reference
          </Button>
          <Button variant="default" onClick={seed}>
            Tweak
          </Button>
          <Button onClick={seed}>Re-run</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
