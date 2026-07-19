import {
  DEFAULT_MODEL,
  IMAGE_MODELS,
  MODEL_CAPABILITIES,
  resolveModel,
  SIZE_PRESETS,
  validateSizeForModel,
  type GenerateRequest,
} from '@image-gen/shared'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import { EmptyState } from 'basalt-ui'
import { useEffect, useMemo, useState } from 'react'
import { useQueue } from '../lib/queue'
import type { SaveGenerationRequest } from '../lib/library'
import { PRESETS } from '../lib/presets'
import { isSettingsConfigured, type Settings } from '../lib/settings'
import type { ComposerSeed } from '../App'

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...IMAGE_MODELS.map((model) => ({ value: model, label: model })),
]

const QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high']
const BACKGROUND_OPTIONS = ['auto', 'opaque', 'transparent']
const FORMAT_OPTIONS = ['png', 'webp', 'jpeg']
const MODERATION_OPTIONS = ['auto', 'low']

const PRESET_OPTIONS = PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))

type ComposeProps = {
  settings: Settings
  seed: ComposerSeed | null
  onOpenSettings: () => void
}

export function Compose({ settings, seed, onOpenSettings }: ComposeProps) {
  const queue = useQueue()
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<GenerateRequest['model']>(DEFAULT_MODEL)
  const [sizeChoice, setSizeChoice] = useState<string>('auto')
  const [customSize, setCustomSize] = useState('')
  const [quality, setQuality] = useState<GenerateRequest['quality']>('auto')
  const [background, setBackground] = useState<GenerateRequest['background']>('auto')
  const [outputFormat, setOutputFormat] = useState<GenerateRequest['output_format']>('png')
  const [outputCompression, setOutputCompression] = useState<number | undefined>(undefined)
  const [moderation, setModeration] = useState<GenerateRequest['moderation']>('auto')
  const [n, setN] = useState(1)
  const [parentId, setParentId] = useState<string | undefined>(undefined)
  const [presetId, setPresetId] = useState<string | null>(null)

  const [jobId, setJobId] = useState<string | null>(null)
  const activeJob = jobId ? queue.jobs.find((job) => job.id === jobId) : undefined

  useEffect(() => {
    if (!seed) return
    const req = seed.request
    setPrompt(req.prompt)
    setModel(req.model ?? DEFAULT_MODEL)
    const size = req.size ?? 'auto'
    if ((SIZE_PRESETS as readonly string[]).includes(size)) {
      setSizeChoice(size)
      setCustomSize('')
    } else {
      setSizeChoice('custom')
      setCustomSize(size)
    }
    setQuality(req.quality ?? 'auto')
    setBackground(req.background ?? 'auto')
    setOutputFormat(req.output_format ?? 'png')
    setOutputCompression(req.output_compression)
    setModeration(req.moderation ?? 'auto')
    setN(req.n ?? 1)
    setParentId(seed.parentId)
    setPresetId(null)
    setJobId(null)
  }, [seed])

  // Mirrors the gateway's own routing rule: which model actually serves this request,
  // after the auto/transparency reroute. Everything size-related below gates on this,
  // not on the raw `model` selection, so "transparent + custom size" is unreachable.
  const resolvedModel = useMemo(() => resolveModel({ model, background }), [model, background])
  const canCustomSize = MODEL_CAPABILITIES[resolvedModel].customSize

  // If the resolved model can no longer do custom sizes (e.g. the user just flipped
  // background to "transparent"), snap back to a valid preset — an invalid combination
  // must never survive to submission.
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
        description="Add the image-gen gateway URL and bearer token in Settings to start generating."
        action={<Button onClick={onOpenSettings}>Open settings</Button>}
      />
    )
  }

  const sizeOptions = canCustomSize ? [...SIZE_PRESETS, 'custom'] : [...SIZE_PRESETS]
  const effectiveSize = sizeChoice === 'custom' ? customSize : sizeChoice
  const customSizeError =
    sizeChoice === 'custom' ? validateSizeForModel(resolvedModel, customSize) : null
  const compressionEnabled = outputFormat !== 'png'
  const loading = activeJob?.status === 'running'
  const result = activeJob?.response ?? null

  const canGenerate = prompt.trim().length > 0 && !loading && customSizeError === null

  function applyPreset(id: string | null): void {
    setPresetId(id)
    if (!id) return
    const preset = PRESETS.find((candidate) => candidate.id === id)
    if (!preset) return

    setModel(preset.request.model)
    setQuality(preset.request.quality)
    setBackground(preset.request.background)
    if ((SIZE_PRESETS as readonly string[]).includes(preset.request.size)) {
      setSizeChoice(preset.request.size)
      setCustomSize('')
    } else {
      setSizeChoice('custom')
      setCustomSize(preset.request.size)
    }
  }

  function handleCancel(): void {
    if (jobId) queue.cancel(jobId)
  }

  function handleGenerate(): void {
    const input: SaveGenerationRequest = {
      prompt,
      model,
      size: effectiveSize,
      quality,
      background,
      output_format: outputFormat,
      n,
      moderation,
      ...(outputCompression !== undefined ? { output_compression: outputCompression } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    }

    setJobId(queue.enqueueGenerate(input))
  }

  return (
    <Stack gap="lg" p="lg" maw={860} mx="auto">
      <Card withBorder py="xs" px="sm">
        <Stack gap="md">
          <Textarea
            label="Prompt"
            placeholder="Describe the image you want…"
            autosize
            minRows={3}
            maxRows={10}
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />

          <Select
            label="Preset"
            placeholder="Apply a preset…"
            data={PRESET_OPTIONS}
            value={presetId}
            onChange={applyPreset}
            description={
              presetId ? PRESETS.find((preset) => preset.id === presetId)?.description : undefined
            }
            clearable
          />

          <Group grow align="flex-start">
            <Select
              label="Model"
              data={MODEL_OPTIONS}
              value={model}
              onChange={(value) => {
                if (value) setModel(value as GenerateRequest['model'])
              }}
              allowDeselect={false}
            />
            <Select
              label="Format"
              data={FORMAT_OPTIONS}
              value={outputFormat}
              onChange={(value) => {
                if (value) setOutputFormat(value as GenerateRequest['output_format'])
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
              data={sizeOptions.map((value) => ({ value, label: value }))}
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
              onChange={(value) => setQuality(value as GenerateRequest['quality'])}
              data={QUALITY_OPTIONS}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Background
            </Text>
            <SegmentedControl
              value={background}
              onChange={(value) => setBackground(value as GenerateRequest['background'])}
              data={BACKGROUND_OPTIONS}
            />
          </Stack>

          <Group grow align="flex-start">
            <NumberInput
              label="Output compression"
              description={
                compressionEnabled ? '0–100, jpeg/webp only.' : 'Only applies to jpeg/webp output.'
              }
              min={0}
              max={100}
              disabled={!compressionEnabled}
              {...(outputCompression !== undefined ? { value: outputCompression } : {})}
              onChange={(value) => {
                if (value === '') {
                  setOutputCompression(undefined)
                  return
                }
                const parsed = typeof value === 'number' ? value : Number(value)
                setOutputCompression(Number.isNaN(parsed) ? undefined : parsed)
              }}
            />
            <Select
              label="Moderation"
              data={MODERATION_OPTIONS}
              value={moderation}
              onChange={(value) => {
                if (value) setModeration(value as GenerateRequest['moderation'])
              }}
              allowDeselect={false}
            />
          </Group>

          <Group justify="flex-end">
            {loading && (
              <Button variant="outline" color="red" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            <Button onClick={handleGenerate} loading={loading} disabled={!canGenerate}>
              Generate
            </Button>
          </Group>
        </Stack>
      </Card>

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
                    alt={`Generation result ${index + 1}`}
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
