import {
  ColorSwatch,
  Group,
  NumberInput,
  SegmentedControl,
  Slider,
  Stack,
  Text,
} from '@mantine/core'
import type { Recipe } from '../../lib/imaging/recipe'
import { parseNumberInput } from './numberField'

type BackgroundModeChoice = 'off' | 'corners' | 'picks'

function modeChoice(background: Recipe['background']): BackgroundModeChoice {
  if (!background.enabled) return 'off'
  return background.mode
}

type BackgroundPanelProps = {
  background: Recipe['background']
  maskCleanup: Recipe['maskCleanup']
  onBackgroundChange: (patch: Partial<Recipe['background']>) => void
  onMaskCleanupChange: (patch: Partial<Recipe['maskCleanup']>) => void
  /** Sampled seed color, for the live readout — null while no image is loaded. */
  seedColor: readonly [number, number, number] | null
  /** `transparentFraction` of the current mask, for the live readout. */
  transparentPct: number | null
}

export function BackgroundPanel({
  background,
  maskCleanup,
  onBackgroundChange,
  onMaskCleanupChange,
  seedColor,
  transparentPct,
}: BackgroundPanelProps) {
  function handleMode(value: string): void {
    const choice = value as BackgroundModeChoice
    if (choice === 'off') {
      onBackgroundChange({ enabled: false })
      return
    }
    onBackgroundChange({ enabled: true, mode: choice })
  }

  return (
    <Stack gap="sm">
      <SegmentedControl
        value={modeChoice(background)}
        onChange={handleMode}
        data={[
          { label: 'Off', value: 'off' },
          { label: 'Corners', value: 'corners' },
          { label: 'Picks', value: 'picks' },
        ]}
      />

      {background.enabled && (
        <>
          <Group gap="xs">
            {seedColor && (
              <ColorSwatch
                color={`rgb(${seedColor[0]}, ${seedColor[1]}, ${seedColor[2]})`}
                size={20}
              />
            )}
            <Text size="xs" c="dimmed">
              {seedColor ? `Seed rgb(${seedColor.join(', ')})` : 'Seed color unavailable'}
              {transparentPct !== null && ` · ${(transparentPct * 100).toFixed(0)}% transparent`}
            </Text>
          </Group>

          {background.mode === 'picks' && (
            <Text size="xs" c="dimmed">
              Click the stage to add a seed, option-click to remove one.
            </Text>
          )}

          <SliderField
            label="Tolerance"
            value={background.tolerance}
            onChange={(value) => onBackgroundChange({ tolerance: value })}
            min={0}
            max={40}
            step={0.5}
          />
          <SliderField
            label="Softness"
            value={background.softness}
            onChange={(value) => onBackgroundChange({ softness: value })}
            min={0}
            max={40}
            step={0.5}
          />
        </>
      )}

      <SliderField
        label="Shrink / grow"
        value={maskCleanup.morph}
        onChange={(value) => onMaskCleanupChange({ morph: value })}
        min={-5}
        max={5}
        step={1}
      />
      <SliderField
        label="Feather"
        value={maskCleanup.feather}
        onChange={(value) => onMaskCleanupChange({ feather: value })}
        min={0}
        max={8}
        step={1}
      />

      <NumberInput
        label="Fill holes (min area)"
        min={0}
        value={maskCleanup.fillHolesMinArea}
        onChange={(value) => onMaskCleanupChange({ fillHolesMinArea: parseNumberInput(value) })}
      />

      <Stack gap={2}>
        <NumberInput
          label="Remove specks (min area)"
          min={0}
          value={maskCleanup.removeSpecksMinArea}
          onChange={(value) =>
            onMaskCleanupChange({ removeSpecksMinArea: parseNumberInput(value) })
          }
        />
        <Text size="xs" c="dimmed">
          Deletes small disconnected pieces — including intentional sparkles.
        </Text>
      </Stack>

      <SliderField
        label="Defringe"
        value={maskCleanup.defringeStrength}
        onChange={(value) => onMaskCleanupChange({ defringeStrength: value })}
        min={0}
        max={1}
        step={0.05}
      />
    </Stack>
  )
}

type SliderFieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
}

function SliderField({ label, value, onChange, min, max, step }: SliderFieldProps) {
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {value}
        </Text>
      </Group>
      <Slider value={value} onChange={onChange} min={min} max={max} step={step} />
    </Stack>
  )
}
