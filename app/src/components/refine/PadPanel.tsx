import { Button, Group, Slider, Stack, Text } from '@mantine/core'
import type { Recipe } from '../../lib/imaging/recipe'

const MACOS_ICON_INSET_PCT = 0.1

type PadPanelProps = {
  pad: Recipe['pad']
  onChange: (patch: Partial<Recipe['pad']>) => void
}

export function PadPanel({ pad, onChange }: PadPanelProps) {
  return (
    <Stack gap="sm">
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Inset
          </Text>
          <Text size="xs" c="dimmed">
            {(pad.insetPct * 100).toFixed(1)}%
          </Text>
        </Group>
        <Slider
          value={pad.insetPct}
          onChange={(value) => onChange({ insetPct: value })}
          min={0}
          max={0.49}
          step={0.005}
        />
      </Stack>
      <Button
        size="xs"
        variant="default"
        onClick={() => onChange({ insetPct: MACOS_ICON_INSET_PCT })}
      >
        macOS icon (10%)
      </Button>
    </Stack>
  )
}
