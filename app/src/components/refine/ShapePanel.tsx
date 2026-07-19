import { Group, SegmentedControl, Slider, Stack, Text } from '@mantine/core'
import type { Recipe } from '../../lib/imaging/recipe'

type ShapeKind = Recipe['shape']['kind']

type ShapePanelProps = {
  shape: Recipe['shape']
  onChange: (patch: Partial<Recipe['shape']>) => void
}

export function ShapePanel({ shape, onChange }: ShapePanelProps) {
  const radiusRelevant = shape.kind === 'appleSquircle' || shape.kind === 'roundedRect'

  return (
    <Stack gap="sm">
      <SegmentedControl
        value={shape.kind}
        onChange={(value) => onChange({ kind: value as ShapeKind })}
        data={[
          { label: 'None', value: 'none' },
          { label: 'Apple squircle', value: 'appleSquircle' },
          { label: 'Circle', value: 'circle' },
          { label: 'Rounded rect', value: 'roundedRect' },
        ]}
      />
      {radiusRelevant && (
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Radius
            </Text>
            <Text size="xs" c="dimmed">
              {(shape.radiusPct * 100).toFixed(1)}%
            </Text>
          </Group>
          <Slider
            value={shape.radiusPct}
            onChange={(value) => onChange({ radiusPct: value })}
            min={0}
            max={0.5}
            step={0.005}
          />
        </Stack>
      )}
    </Stack>
  )
}
