import type { GenerateRequestInput } from '@image-gen/shared'
import { ActionIcon, Group, ScrollArea, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { Activity, useCallback, useEffect, useState } from 'react'
import { QueueBar } from './components/QueueBar'
import { SettingsModal } from './components/SettingsModal'
import type { Recipe } from './lib/imaging/recipe'
import { listGenerations, type LibraryEntry } from './lib/library'
import { QueueProvider } from './lib/queue'
import { useSettings } from './lib/settings'
import { Compose } from './views/Compose'
import { Edit } from './views/Edit'
import { Library } from './views/Library'
import { Refine } from './views/Refine'

export type ComposerSeed = {
  request: GenerateRequestInput
  parentId?: string
}

/** Seeds the Edit view with a reference image (e.g. from a past generation) and its lineage. */
export type EditorSeed = {
  image: File
  parentId?: string
}

/** Seeds the Refine view with a past generation's first output image plus the generation id
 * exports get written back under (`<id>/derived/...`). An optional `recipe` reopens the workbench
 * with a previously exported derivative's saved recipe instead of the workbench's own defaults
 * (e.g. "Refine again" from the Library). */
export type RefineSeed = {
  generationId: string
  image: File
  recipe?: Recipe
}

type View = 'compose' | 'library' | 'edit' | 'refine'

export function App() {
  const [view, setView] = useState<View>('compose')
  const [composerSeed, setComposerSeed] = useState<ComposerSeed | null>(null)
  const [editorSeed, setEditorSeed] = useState<EditorSeed | null>(null)
  const [refineSeed, setRefineSeed] = useState<RefineSeed | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings] = useSettings()
  const [entries, setEntries] = useState<LibraryEntry[]>([])

  const refreshLibrary = useCallback(async () => {
    const next = await listGenerations()
    setEntries(next)
  }, [])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  const totalCost = entries.reduce((sum, entry) => sum + (entry.metadata.cost.usd ?? 0), 0)

  function seedComposer(seed: ComposerSeed): void {
    setComposerSeed(seed)
    setView('compose')
  }

  function seedEditor(seed: EditorSeed): void {
    setEditorSeed(seed)
    setView('edit')
  }

  function seedRefine(seed: RefineSeed): void {
    setRefineSeed(seed)
    setView('refine')
  }

  return (
    <QueueProvider settings={settings} onSaved={() => void refreshLibrary()}>
      <Stack gap={0} style={{ height: '100vh' }}>
        <Group
          justify="space-between"
          px="md"
          py="sm"
          style={{ borderBottom: '1px solid var(--vx-surface-border)', flexShrink: 0 }}
        >
          <Title order={4}>ImageGen</Title>
          <Group gap="lg">
            <SegmentedControl
              value={view}
              onChange={(value) => setView(value as View)}
              data={[
                { label: 'Compose', value: 'compose' },
                { label: 'Library', value: 'library' },
                { label: 'Edit', value: 'edit' },
                { label: 'Refine', value: 'refine' },
              ]}
            />
            <Text size="sm" c="dimmed">
              {entries.length} generations · ${totalCost.toFixed(2)}
            </Text>
            <ActionIcon
              variant="subtle"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              ⚙
            </ActionIcon>
          </Group>
        </Group>

        <QueueBar />

        {/* Each view stays mounted via `Activity` so tab switches preserve form state (typed
            prompt, selected model/size, …) instead of resetting it on unmount. `mode="hidden"`
            renders the subtree with `display: none`, so the hidden `ScrollArea`s take no layout
            space and each view keeps its own independent scroll position. */}
        <Activity mode={view === 'compose' ? 'visible' : 'hidden'}>
          <ScrollArea style={{ flex: 1 }} scrollbars="y">
            <Compose
              settings={settings}
              seed={composerSeed}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </ScrollArea>
        </Activity>
        <Activity mode={view === 'edit' ? 'visible' : 'hidden'}>
          <ScrollArea style={{ flex: 1 }} scrollbars="y">
            <Edit
              settings={settings}
              seed={editorSeed}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </ScrollArea>
        </Activity>
        <Activity mode={view === 'library' ? 'visible' : 'hidden'}>
          <ScrollArea style={{ flex: 1 }} scrollbars="y">
            <Library
              entries={entries}
              totalCost={totalCost}
              onSeedComposer={seedComposer}
              onSeedEditor={seedEditor}
              onSeedRefine={seedRefine}
            />
          </ScrollArea>
        </Activity>
        <Activity mode={view === 'refine' ? 'visible' : 'hidden'}>
          <ScrollArea style={{ flex: 1 }} scrollbars="y">
            <Refine seed={refineSeed} />
          </ScrollArea>
        </Activity>

        <SettingsModal opened={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Stack>
    </QueueProvider>
  )
}
