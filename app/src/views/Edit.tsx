import {
  DEFAULT_MODEL,
  EDIT_LIMITS,
  IMAGE_MODELS,
  INPUT_IMAGE_MIME_TYPES,
  MODEL_CAPABILITIES,
  resolveModel,
  SIZE_PRESETS,
  validateSizeForModel,
  type EditRequest,
} from '@image-gen/shared'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  NumberInput,
  Select,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { error as logError } from '@tauri-apps/plugin-log'
import { EmptyState } from 'basalt-ui'
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type Ref,
} from 'react'
import { useQueue } from '../lib/queue'
import type { SaveEditRequest } from '../lib/library'
import { isSettingsConfigured, type Settings } from '../lib/settings'
import type { EditorSeed } from '../App'

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...IMAGE_MODELS.map((model) => ({ value: model, label: model })),
]

const QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high']
const BACKGROUND_OPTIONS = ['auto', 'opaque', 'transparent']
const FORMAT_OPTIONS = ['png', 'webp', 'jpeg']
const MODERATION_OPTIONS = ['auto', 'low']

/** input_fidelity is only accepted by models whose capability flag is set; "auto" is unresolved until routing. */
function supportsInputFidelity(model: EditRequest['model']): boolean {
  if (model === 'auto') return false
  return MODEL_CAPABILITIES[model].inputFidelity
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

type ImageItem = { id: string; file: File }
type ImageItemWithUrl = ImageItem & { url: string }

/**
 * Mints and reuses per-file object URLs across renders, revoking each one only when its item is
 * actually removed. Deliberately not tied to the mount lifecycle: `<Activity mode="hidden">` runs
 * effect cleanups while preserving state, so revoking on teardown would blank every thumbnail on a
 * tab round-trip while the memo below — unchanged `items` — hands back the same dead URLs.
 */
function useImageUrls(items: ImageItem[]): ImageItemWithUrl[] {
  const urlsRef = useRef(new Map<string, string>())

  const withUrls = useMemo(() => {
    const next = new Map<string, string>()
    const mapped = items.map((item) => {
      const existing = urlsRef.current.get(item.id)
      const url = existing ?? URL.createObjectURL(item.file)
      next.set(item.id, url)
      return { ...item, url }
    })
    for (const [id, url] of urlsRef.current) {
      if (!next.has(id)) URL.revokeObjectURL(url)
    }
    urlsRef.current = next
    return mapped
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlsRef is a stable ref, intentionally excluded
  }, [items])

  return withUrls
}

/** Inverts the mask canvas's alpha channel: painted (opaque) becomes transparent, per the edit API's mask semantics. */
function exportInvertedMask(sourceCanvas: HTMLCanvasElement): Promise<Blob> {
  const ctx = sourceCanvas.getContext('2d')
  if (!ctx) throw new Error('Mask canvas has no 2D context')
  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255 - (data[i] ?? 0)
  }
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = sourceCanvas.width
  exportCanvas.height = sourceCanvas.height
  const exportCtx = exportCanvas.getContext('2d')
  if (!exportCtx) throw new Error('Mask export canvas has no 2D context')
  exportCtx.putImageData(imageData, 0, 0)
  return new Promise((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to export mask as PNG'))
    }, 'image/png')
  })
}

function hasAnyPaint(imageData: ImageData): boolean {
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 0) !== 0) return true
  }
  return false
}

type MaskCanvasHandle = {
  /** Returns the inverted-alpha mask PNG, or null when nothing has been painted. */
  exportMask: () => Promise<Blob | null>
}

type MaskCanvasProps = {
  ref?: Ref<MaskCanvasHandle>
  imageUrl: string
  brushSize: number
  onBrushSizeChange: (value: number) => void
}

/**
 * Paints a soft inpainting mask over the first reference image. The canvas is sized to the
 * image's NATURAL pixel dimensions (backing store), scaled down only via CSS for display —
 * pointer coordinates are mapped back to natural pixels so the exported mask lines up exactly
 * with the reference image the gateway receives.
 */
function MaskCanvas({ ref, imageUrl, brushSize, onBrushSizeChange }: MaskCanvasProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<ImageData[]>([])
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [hasPainted, setHasPainted] = useState(false)

  useEffect(() => {
    setNaturalSize(null)
    setHasPainted(false)
    historyRef.current = []
  }, [imageUrl])

  function handleImageLoad(): void {
    const img = imgRef.current
    if (!img) return
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  function pushHistory(): void {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (historyRef.current.length > 20) historyRef.current.shift()
  }

  function paintDot(point: { x: number; y: number }): void {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'rgba(220, 38, 38, 1)'
    ctx.beginPath()
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasPainted(true)
  }

  function paintLine(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = 'rgba(220, 38, 38, 1)'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    const point = pointFromEvent(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pushHistory()
    drawingRef.current = true
    lastPointRef.current = point
    paintDot(point)
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return
    const point = pointFromEvent(event)
    const last = lastPointRef.current
    if (!point || !last) return
    paintLine(last, point)
    lastPointRef.current = point
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleUndo(): void {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const previous = historyRef.current.pop()
    if (previous) {
      ctx.putImageData(previous, 0, 0)
      setHasPainted(hasAnyPaint(previous))
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasPainted(false)
    }
  }

  function handleClear(): void {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    pushHistory()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasPainted(false)
  }

  useImperativeHandle(ref, () => ({
    exportMask: async () => {
      const canvas = canvasRef.current
      if (!canvas || !hasPainted) return null
      return exportInvertedMask(canvas)
    },
  }))

  return (
    <Stack gap="xs">
      <div style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
        <img
          ref={imgRef}
          src={imageUrl}
          onLoad={handleImageLoad}
          alt="Reference 1 — paint the region to edit"
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
        />
        {naturalSize && (
          <canvas
            ref={canvasRef}
            aria-label="Paint mask over the reference image"
            width={naturalSize.width}
            height={naturalSize.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0.45,
              cursor: 'crosshair',
              borderRadius: 8,
              touchAction: 'none',
            }}
          />
        )}
      </div>
      <Group gap="sm" align="center">
        <Text size="sm" c="dimmed">
          Brush size
        </Text>
        <Slider
          value={brushSize}
          onChange={onBrushSizeChange}
          min={5}
          max={150}
          style={{ width: 160 }}
        />
        <Button size="xs" variant="default" onClick={handleUndo}>
          Undo
        </Button>
        <Button size="xs" variant="default" onClick={handleClear} disabled={!hasPainted}>
          Clear
        </Button>
        {hasPainted && (
          <Text size="xs" c="dimmed">
            Painted area will be edited; everything else is preserved
          </Text>
        )}
      </Group>
    </Stack>
  )
}

type EditProps = {
  settings: Settings
  seed: EditorSeed | null
  onOpenSettings: () => void
}

export function Edit({ settings, seed, onOpenSettings }: EditProps) {
  const queue = useQueue()
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<EditRequest['model']>(DEFAULT_MODEL)
  const [sizeChoice, setSizeChoice] = useState<string>('auto')
  const [customSize, setCustomSize] = useState('')
  const [quality, setQuality] = useState<EditRequest['quality']>('auto')
  const [background, setBackground] = useState<EditRequest['background']>('auto')
  const [outputFormat, setOutputFormat] = useState<EditRequest['output_format']>('png')
  const [n, setN] = useState(1)
  const [moderation, setModeration] = useState<EditRequest['moderation']>('auto')
  const [inputFidelityChoice, setInputFidelityChoice] = useState<'default' | 'high' | 'low'>(
    'default',
  )
  const [parentId, setParentId] = useState<string | undefined>(undefined)

  const [imageItems, setImageItems] = useState<ImageItem[]>([])
  const imagesWithUrls = useImageUrls(imageItems)
  const [brushSize, setBrushSize] = useState(40)
  const maskCanvasRef = useRef<MaskCanvasHandle>(null)

  const [jobId, setJobId] = useState<string | null>(null)
  const activeJob = jobId ? queue.jobs.find((job) => job.id === jobId) : undefined

  useEffect(() => {
    if (!seed) return
    setImageItems([{ id: crypto.randomUUID(), file: seed.image }])
    setParentId(seed.parentId)
    setJobId(null)
  }, [seed])

  useEffect(() => {
    if (!supportsInputFidelity(model)) setInputFidelityChoice('default')
  }, [model])

  // Mirrors the gateway's own routing rule: which model actually serves this request,
  // after the auto/transparency reroute. Custom-size availability gates on this, not on
  // the raw `model` selection, so "transparent + custom size" is unreachable.
  const resolvedModel = useMemo(() => resolveModel({ model, background }), [model, background])
  const canCustomSize = MODEL_CAPABILITIES[resolvedModel].customSize

  useEffect(() => {
    if (!canCustomSize && sizeChoice === 'custom') {
      setSizeChoice('auto')
      setCustomSize('')
    }
  }, [canCustomSize, sizeChoice])

  if (!isSettingsConfigured(settings)) {
    return (
      <EmptyState
        title="Connect your gateway"
        description="Add the image-gen gateway URL and bearer token in Settings to start editing."
        action={<Button onClick={onOpenSettings}>Open settings</Button>}
      />
    )
  }

  const effectiveSize = sizeChoice === 'custom' ? customSize : sizeChoice
  const customSizeError =
    sizeChoice === 'custom' ? validateSizeForModel(resolvedModel, customSize) : null
  const firstImage = imagesWithUrls[0]
  const loading = activeJob?.status === 'running'
  const result = activeJob?.response ?? null
  const canSubmit =
    prompt.trim().length > 0 && imageItems.length > 0 && !loading && customSizeError === null

  function handleFilesPicked(candidates: File[]): void {
    if (candidates.length === 0) return
    const errors: string[] = []
    const accepted: ImageItem[] = []
    let remainingSlots = EDIT_LIMITS.maxImages - imageItems.length

    for (const file of candidates) {
      if (remainingSlots <= 0) {
        errors.push(
          `Only ${EDIT_LIMITS.maxImages} reference images are allowed — "${file.name}" was skipped.`,
        )
        continue
      }
      if (!(INPUT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
        errors.push(`"${file.name}" is not a supported type (png, jpeg, webp).`)
        continue
      }
      if (file.size > EDIT_LIMITS.maxImageBytes) {
        errors.push(`"${file.name}" exceeds the ${formatBytes(EDIT_LIMITS.maxImageBytes)} limit.`)
        continue
      }
      accepted.push({ id: crypto.randomUUID(), file })
      remainingSlots -= 1
    }

    if (accepted.length > 0) setImageItems((prev) => [...prev, ...accepted])
    for (const message of errors) {
      notifications.show({ color: 'red', title: 'Image rejected', message })
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    handleFilesPicked(Array.from(event.dataTransfer.files))
  }

  function removeImage(id: string): void {
    setImageItems((prev) => prev.filter((item) => item.id !== id))
  }

  function swapImages(a: number, b: number): void {
    setImageItems((prev) => {
      if (b < 0 || b >= prev.length) return prev
      const itemA = prev[a]
      const itemB = prev[b]
      if (!itemA || !itemB) return prev
      const next = [...prev]
      next[a] = itemB
      next[b] = itemA
      return next
    })
  }

  function buildInput(): SaveEditRequest {
    return {
      prompt,
      model,
      size: effectiveSize,
      quality,
      background,
      output_format: outputFormat,
      n,
      moderation,
      ...(inputFidelityChoice !== 'default' ? { input_fidelity: inputFidelityChoice } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    }
  }

  function handleCancel(): void {
    if (jobId) queue.cancel(jobId)
  }

  async function handleSubmit(): Promise<void> {
    try {
      let maskFile: File | undefined
      const maskBlob = await maskCanvasRef.current?.exportMask()
      if (maskBlob) {
        if (maskBlob.size > EDIT_LIMITS.maxMaskBytes) {
          notifications.show({
            color: 'red',
            title: 'Mask too large',
            message: `Painted mask is ${formatBytes(maskBlob.size)} — must be under ${formatBytes(EDIT_LIMITS.maxMaskBytes)}. Clear some of the painted area.`,
          })
          return
        }
        maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' })
      }

      const input = buildInput()
      const images = imageItems.map((item) => item.file)
      setJobId(queue.enqueueEdit(input, images, maskFile))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void logError(`mask export failed: ${message}`)
      notifications.show({ color: 'red', title: 'Could not prepare edit', message })
    }
  }

  return (
    <Stack gap="lg" p="lg" maw={860} mx="auto">
      <Card withBorder py="xs" px="sm">
        <Stack gap="md">
          <Textarea
            label="Prompt"
            placeholder="Describe the edit…"
            autosize
            minRows={3}
            maxRows={10}
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />

          <Group grow align="flex-start">
            <Select
              label="Model"
              data={MODEL_OPTIONS}
              value={model}
              onChange={(value) => {
                if (value) setModel(value as EditRequest['model'])
              }}
              allowDeselect={false}
            />
            <Select
              label="Format"
              data={FORMAT_OPTIONS}
              value={outputFormat}
              onChange={(value) => {
                if (value) setOutputFormat(value as EditRequest['output_format'])
              }}
              allowDeselect={false}
            />
            <NumberInput
              label="Images"
              min={1}
              max={10}
              value={n}
              onChange={(value) => {
                const parsed = typeof value === 'number' ? value : Number(value)
                if (!Number.isNaN(parsed)) setN(parsed)
              }}
            />
          </Group>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Size
            </Text>
            <SegmentedControl
              value={sizeChoice}
              onChange={setSizeChoice}
              data={[...SIZE_PRESETS, 'custom'].map((value) => ({
                value,
                label: value,
                ...(value === 'custom' ? { disabled: !canCustomSize } : {}),
              }))}
            />
            {sizeChoice === 'custom' && (
              <TextInput
                placeholder="e.g. 2560x1440"
                value={customSize}
                onChange={(event) => setCustomSize(event.currentTarget.value)}
                error={customSizeError ?? undefined}
              />
            )}
            {!canCustomSize && (
              <Text size="xs" c="dimmed">
                {background === 'transparent'
                  ? `Transparent backgrounds use ${resolvedModel}, which supports only preset sizes.`
                  : `${resolvedModel} supports only preset sizes.`}
              </Text>
            )}
          </Stack>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Quality
            </Text>
            <SegmentedControl
              value={quality}
              onChange={(value) => setQuality(value as EditRequest['quality'])}
              data={QUALITY_OPTIONS}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Background
            </Text>
            <SegmentedControl
              value={background}
              onChange={(value) => setBackground(value as EditRequest['background'])}
              data={BACKGROUND_OPTIONS}
            />
            <Text size="xs" c="dimmed">
              gpt-image-2 doesn't support transparency — transparent requests route automatically to
              gpt-image-1.5.
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Moderation
            </Text>
            <SegmentedControl
              value={moderation}
              onChange={(value) => setModeration(value as EditRequest['moderation'])}
              data={MODERATION_OPTIONS}
            />
          </Stack>

          {supportsInputFidelity(model) && (
            <Stack gap={4}>
              <Group gap={6}>
                <Text size="sm" fw={500}>
                  Input fidelity
                </Text>
                <Tooltip label="How closely the edit preserves details from your reference images — high keeps faces, logos, and textures more faithful; low gives the model more creative freedom.">
                  <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>
                    ⓘ
                  </Text>
                </Tooltip>
              </Group>
              <SegmentedControl
                value={inputFidelityChoice}
                onChange={(value) => setInputFidelityChoice(value as 'default' | 'high' | 'low')}
                data={[
                  { value: 'default', label: 'Default' },
                  { value: 'high', label: 'High' },
                  { value: 'low', label: 'Low' },
                ]}
              />
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder py="xs" px="sm">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={5}>Reference images</Title>
            <Text size="xs" c="dimmed">
              {imageItems.length} / {EDIT_LIMITS.maxImages} · order matters — referenced in the
              prompt as "image 1", "image 2", …
            </Text>
          </Group>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={{
              border: '1px dashed var(--vx-surface-border)',
              borderRadius: 8,
              padding: 24,
            }}
          >
            <Stack gap="xs" align="center">
              <Text size="sm" c="dimmed">
                Drag & drop images here
              </Text>
              <FileButton
                onChange={handleFilesPicked}
                accept={INPUT_IMAGE_MIME_TYPES.join(',')}
                multiple
              >
                {(props) => (
                  <Button {...props} variant="default" size="xs">
                    Choose files
                  </Button>
                )}
              </FileButton>
            </Stack>
          </div>

          {imagesWithUrls.length > 0 && (
            <SimpleGrid cols={{ base: 3, sm: 4, md: 6 }} spacing="sm">
              {imagesWithUrls.map((item, index) => (
                // theme-allow: square thumbnail needs a tight uniform padding, not the content-card xs/sm inset
                <Card key={item.id} withBorder padding={4} pos="relative">
                  <Badge
                    size="xs"
                    variant="filled"
                    style={{ position: 'absolute', top: 4, left: 4, zIndex: 1 }}
                  >
                    {index + 1}
                  </Badge>
                  <img
                    src={item.url}
                    alt={`Reference ${index + 1}`}
                    style={{
                      width: '100%',
                      height: 96,
                      objectFit: 'cover',
                      borderRadius: 4,
                      display: 'block',
                    }}
                  />
                  <Group gap={4} justify="center" mt={4}>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      disabled={index === 0}
                      onClick={() => swapImages(index, index - 1)}
                      aria-label="Move earlier"
                    >
                      ↑
                    </ActionIcon>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      disabled={index === imagesWithUrls.length - 1}
                      onClick={() => swapImages(index, index + 1)}
                      aria-label="Move later"
                    >
                      ↓
                    </ActionIcon>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => removeImage(item.id)}
                      aria-label="Remove"
                    >
                      ✕
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </Card>

      {firstImage && (
        <Card withBorder py="xs" px="sm">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Mask (optional)</Title>
              <Text size="xs" c="dimmed">
                Applies to image 1 only — unpainted areas are preserved
              </Text>
            </Group>
            <MaskCanvas
              key={firstImage.id}
              ref={maskCanvasRef}
              imageUrl={firstImage.url}
              brushSize={brushSize}
              onBrushSizeChange={setBrushSize}
            />
          </Stack>
        </Card>
      )}

      <Group justify="flex-end" gap="sm">
        {loading && (
          <Button variant="default" onClick={handleCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={() => void handleSubmit()} loading={loading} disabled={!canSubmit}>
          Generate edit
        </Button>
      </Group>

      {result && (
        <Card withBorder py="xs" px="sm">
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>Result</Title>
              <Group gap="xs">
                {result.routed && (
                  <Tooltip label={result.routing_reason ?? 'Model routed automatically'}>
                    <Badge color="orange" variant="light">
                      rerouted to {result.model}
                    </Badge>
                  </Tooltip>
                )}
                <Badge variant="light">{result.model}</Badge>
              </Group>
            </Group>

            <Group gap="md" wrap="wrap">
              {result.images.map((image, index) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key -- images have no stable id
                  key={index}
                  className={
                    result.background === 'transparent' ? 'image-gen-checkerboard' : undefined
                  }
                  style={{ borderRadius: 8, overflow: 'hidden' }}
                >
                  <img
                    src={`data:image/${image.format};base64,${image.b64_json}`}
                    alt={`Edit result ${index + 1}`}
                    style={{ maxWidth: 320, maxHeight: 320, display: 'block' }}
                  />
                </div>
              ))}
            </Group>

            <Group gap="lg">
              <Text size="sm" c="dimmed">
                Cost: {result.cost.usd !== null ? `$${result.cost.usd.toFixed(4)}` : 'n/a'}
              </Text>
              <Text size="sm" c="dimmed">
                Tokens: {result.usage.total_tokens}
              </Text>
              <Text size="sm" c="dimmed">
                Latency: {result.latency_ms}ms
              </Text>
            </Group>

            {activeJob?.savedId && (
              <Alert color="green" variant="light">
                Saved to library as <strong>{activeJob.savedId}</strong>
              </Alert>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
