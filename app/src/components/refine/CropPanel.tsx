import { Button, Group, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import type { Recipe } from '../../lib/imaging/recipe'
import type { Rect } from '../../lib/imaging/types'
import { parseNumberInput } from './numberField'

type AspectChoice = 'free' | '1:1' | '16:9' | '4:5'

const ASPECT_RATIOS: Record<Exclude<AspectChoice, 'free'>, number> = {
  '1:1': 1,
  '16:9': 16 / 9,
  '4:5': 4 / 5,
}

/** A centered rect of the given aspect ratio, as large as fits inside `imageSize`. */
function centeredRectForAspect(imageSize: { width: number; height: number }, ratio: number): Rect {
  const { width, height } = imageSize
  let w = width
  let h = w / ratio
  if (h > height) {
    h = height
    w = h * ratio
  }
  return {
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  }
}

type CropPanelProps = {
  crop: Recipe['crop']
  imageSize: { width: number; height: number } | null
  onChange: (patch: Partial<Recipe['crop']>) => void
  canTrimToContent: boolean
  onTrimToContent: () => void
}

export function CropPanel({
  crop,
  imageSize,
  onChange,
  canTrimToContent,
  onTrimToContent,
}: CropPanelProps) {
  const [aspectChoice, setAspectChoice] = useState<AspectChoice>('free')
  const rect =
    crop.rect ??
    (imageSize ? { x: 0, y: 0, width: imageSize.width, height: imageSize.height } : null)

  function handleAspect(value: string): void {
    const choice = value as AspectChoice
    setAspectChoice(choice)
    if (choice === 'free' || !imageSize) return
    onChange({
      enabled: true,
      autoTrim: false,
      rect: centeredRectForAspect(imageSize, ASPECT_RATIOS[choice]),
    })
  }

  function updateRectField(field: keyof Rect, value: string | number): void {
    if (!rect) return
    onChange({
      enabled: true,
      autoTrim: false,
      rect: { ...rect, [field]: parseNumberInput(value) },
    })
  }

  function handleReset(): void {
    setAspectChoice('free')
    onChange({ enabled: false, autoTrim: false, rect: null })
  }

  return (
    <Stack gap="sm">
      <SegmentedControl
        value={aspectChoice}
        onChange={handleAspect}
        data={[
          { label: 'Free', value: 'free' },
          { label: '1:1', value: '1:1' },
          { label: '16:9', value: '16:9' },
          { label: '4:5', value: '4:5' },
        ]}
      />
      <Group grow>
        <NumberInput
          label="X"
          value={rect?.x ?? 0}
          onChange={(value) => updateRectField('x', value)}
          disabled={!rect}
        />
        <NumberInput
          label="Y"
          value={rect?.y ?? 0}
          onChange={(value) => updateRectField('y', value)}
          disabled={!rect}
        />
      </Group>
      <Group grow>
        <NumberInput
          label="Width"
          min={1}
          value={rect?.width ?? 0}
          onChange={(value) => updateRectField('width', value)}
          disabled={!rect}
        />
        <NumberInput
          label="Height"
          min={1}
          value={rect?.height ?? 0}
          onChange={(value) => updateRectField('height', value)}
          disabled={!rect}
        />
      </Group>
      <Group gap="xs">
        <Button size="xs" variant="default" onClick={handleReset}>
          Reset
        </Button>
        <Button size="xs" variant="default" onClick={onTrimToContent} disabled={!canTrimToContent}>
          Trim to content
        </Button>
      </Group>
      {!canTrimToContent && (
        <Text size="xs" c="dimmed">
          Enable background removal first — trim uses its computed mask.
        </Text>
      )}
    </Stack>
  )
}
