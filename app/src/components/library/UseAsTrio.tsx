import { Button, Group } from '@mantine/core'

export type UseAsAction = 'edit-reference' | 'style-source' | 'reuse'

type UseAsTrioProps = {
  loadingAction: UseAsAction | null
  onUseAsEditReference: () => void
  onUseAsStyleSource: () => void
  onReusePromptSettings: () => void
}

/**
 * Use-as trio, rendered per output image (docs/concept.md §2: "every image is one click from
 * being input again — the single affordance that drives the iterate loop"):
 *
 * - Use as edit reference: seeds Create's references rail with this image (`op: 'edit'`).
 * - Use as style source: marks this image `role: style-source` in place, no navigation — makes it
 *   discoverable later via the reference-role picker and (once built) the Style builder.
 * - Reuse prompt + settings: seeds Create fully editable from this image's generation (`op:
 *   'tweak'`), recording which specific image it was reused from.
 */
export function UseAsTrio({
  loadingAction,
  onUseAsEditReference,
  onUseAsStyleSource,
  onReusePromptSettings,
}: UseAsTrioProps) {
  return (
    <Group gap={4} wrap="wrap">
      <Button
        size="xs"
        variant="default"
        loading={loadingAction === 'edit-reference'}
        disabled={loadingAction !== null && loadingAction !== 'edit-reference'}
        onClick={onUseAsEditReference}
      >
        Use as edit reference
      </Button>
      <Button
        size="xs"
        variant="default"
        loading={loadingAction === 'style-source'}
        disabled={loadingAction !== null && loadingAction !== 'style-source'}
        onClick={onUseAsStyleSource}
      >
        Use as style source
      </Button>
      <Button
        size="xs"
        variant="default"
        loading={loadingAction === 'reuse'}
        disabled={loadingAction !== null && loadingAction !== 'reuse'}
        onClick={onReusePromptSettings}
      >
        Reuse prompt + settings
      </Button>
    </Group>
  )
}
