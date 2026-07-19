import { Button, Group, Slider, Stack, Text } from '@mantine/core'
import type { Recipe } from '../../lib/imaging/recipe'

const IDENTITY_TRANSFORM: Recipe['transform'] = { scale: 1, offsetX: 0, offsetY: 0 }

type TransformPanelProps = {
  transform: Recipe['transform']
  onChange: (patch: Partial<Recipe['transform']>) => void
}

export function TransformPanel({ transform, onChange }: TransformPanelProps) {
  return (
    <Stack gap="sm">
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Zoom
          </Text>
          <Text size="xs" c="dimmed">
            {transform.scale.toFixed(2)}x
          </Text>
        </Group>
        <Slider
          value={transform.scale}
          onChange={(value) => onChange({ scale: value })}
          min={0.1}
          max={4}
          step={0.05}
        />
      </Stack>
      <Text size="xs" c="dimmed">
        Drag directly on the preview to pan.
      </Text>
      <Button size="xs" variant="default" onClick={() => onChange(IDENTITY_TRANSFORM)}>
        Reset
      </Button>
    </Stack>
  )
}
