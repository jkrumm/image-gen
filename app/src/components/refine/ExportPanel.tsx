/** Bakes the current recipe at native resolution and writes named export presets into
 * `<generationId>/derived/`. Baking happens on demand (per export click), not on every recipe
 * edit — the live preview (`useRefinePreview`) is what stays reactive. */
import { Button, CopyButton, Group, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { error as logError } from '@tauri-apps/plugin-log'
import { useState } from 'react'
import { saveDerivative } from '../../lib/derived'
import {
  FAVICON_SET,
  MACOS_ICONSET,
  SINGLE_PNG_SIZES,
  type ExportTarget,
} from '../../lib/exportPresets'
import { toPngBlob } from '../../lib/imaging/dom'
import { resizeImage } from '../../lib/imaging/pad'
import type { Recipe } from '../../lib/imaging/recipe'
import type { RgbaImage } from '../../lib/imaging/types'
import { absolutePath } from '../../lib/library'

function resizeToLongEdge(img: RgbaImage, longEdge: number): RgbaImage {
  const scale = longEdge / Math.max(img.width, img.height)
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  return resizeImage(img, width, height)
}

type ExportKind = 'macos' | 'favicon' | 'single'

type ExportPanelProps = {
  generationId: string
  /** Persisted alongside every export so "Refine again" can reopen the exact settings that
   * produced it. Without this a derivative is a dead end: the pixels survive, the zoom/tolerance
   * that made them do not. */
  recipe: Recipe
  /** Bakes the full-resolution recipe output on demand; null while no image is loaded. */
  bake: () => RgbaImage | null
}

export function ExportPanel({ generationId, recipe, bake }: ExportPanelProps) {
  const [iconsetName, setIconsetName] = useState('icon')
  const [singleSize, setSingleSize] = useState<string>('native')
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [iconsetPath, setIconsetPath] = useState<string | null>(null)

  function reportFailure(kind: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    void logError(`refine export (${kind}) failed: ${message}`)
    notifications.show({ color: 'red', title: 'Export failed', message })
  }

  async function exportSquareSet(
    kind: ExportKind,
    targets: readonly ExportTarget[],
    folder?: string,
  ): Promise<void> {
    const baked = bake()
    if (!baked) return

    setExporting(kind)
    try {
      for (const target of targets) {
        const resized = resizeImage(baked, target.size, target.size)
        const blob = await toPngBlob(resized)
        const relativePath = folder ? `${folder}/${target.name}.png` : `${target.name}.png`
        await saveDerivative(
          generationId,
          relativePath,
          blob,
          { width: target.size, height: target.size },
          target.name,
          recipe,
        )
      }
      if (folder) setIconsetPath(await absolutePath(generationId, `derived/${folder}`))
      notifications.show({
        color: 'green',
        title: 'Exported',
        message: `${targets.length} file${targets.length === 1 ? '' : 's'} written to derived/`,
      })
    } catch (error) {
      reportFailure(kind, error)
    } finally {
      setExporting(null)
    }
  }

  async function exportSingle(): Promise<void> {
    const baked = bake()
    if (!baked) return

    setExporting('single')
    try {
      const resized = singleSize === 'native' ? baked : resizeToLongEdge(baked, Number(singleSize))
      const blob = await toPngBlob(resized)
      const filename = `image-${singleSize}.png`
      await saveDerivative(
        generationId,
        filename,
        blob,
        { width: resized.width, height: resized.height },
        `PNG ${singleSize}`,
        recipe,
      )
      notifications.show({
        color: 'green',
        title: 'Exported',
        message: `${filename} written to derived/`,
      })
    } catch (error) {
      reportFailure('single', error)
    } finally {
      setExporting(null)
    }
  }

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          macOS iconset
        </Text>
        <Group gap="xs" align="flex-end">
          <TextInput
            label="Name"
            size="xs"
            value={iconsetName}
            onChange={(event) => setIconsetName(event.currentTarget.value || 'icon')}
            style={{ maxWidth: 140 }}
          />
          <Button
            size="xs"
            variant="default"
            loading={exporting === 'macos'}
            onClick={() => void exportSquareSet('macos', MACOS_ICONSET, `${iconsetName}.iconset`)}
          >
            Export 10 files
          </Button>
        </Group>
        {iconsetPath && (
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Run this to finish the job:
            </Text>
            <Group gap="xs">
              <Text size="xs" ff="monospace">
                iconutil -c icns "{iconsetPath}"
              </Text>
              <CopyButton value={`iconutil -c icns "${iconsetPath}"`}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied' : 'Copy command'}>
                    <Button size="xs" variant="subtle" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Stack>
        )}
      </Stack>

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Favicon / web
        </Text>
        <Button
          size="xs"
          variant="default"
          loading={exporting === 'favicon'}
          onClick={() => void exportSquareSet('favicon', FAVICON_SET)}
        >
          Export 6 files
        </Button>
      </Stack>

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Single PNG
        </Text>
        <Group gap="xs">
          <Select
            size="xs"
            value={singleSize}
            onChange={(value) => setSingleSize(value ?? 'native')}
            data={SINGLE_PNG_SIZES.map((size) => ({
              value: String(size),
              label: size === 'native' ? 'Native' : String(size),
            }))}
            allowDeselect={false}
            style={{ width: 120 }}
          />
          <Button
            size="xs"
            variant="default"
            loading={exporting === 'single'}
            onClick={() => void exportSingle()}
          >
            Export
          </Button>
        </Group>
      </Stack>

      <Text size="xs" c="dimmed">
        Every export carries alpha — square presets assume a square crop; use 1:1 in Crop first for
        clean icons.
      </Text>
    </Stack>
  )
}
