import { Button, Divider, Modal, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { storeSettings, useSettings, type Settings } from '../lib/settings'

type SettingsModalProps = {
  opened: boolean
  onClose: () => void
}

export function SettingsModal({ opened, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useSettings()
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState(settings.gateway.baseUrl)
  const [gatewayToken, setGatewayToken] = useState(settings.gateway.token)
  const [imageShareBaseUrl, setImageShareBaseUrl] = useState(settings.imageShare?.baseUrl ?? '')
  const [imageShareToken, setImageShareToken] = useState(settings.imageShare?.token ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Re-sync the draft fields from persisted settings each time the modal opens.
  useEffect(() => {
    if (!opened) return
    setGatewayBaseUrl(settings.gateway.baseUrl)
    setGatewayToken(settings.gateway.token)
    setImageShareBaseUrl(settings.imageShare?.baseUrl ?? '')
    setImageShareToken(settings.imageShare?.token ?? '')
  }, [
    opened,
    settings.gateway.baseUrl,
    settings.gateway.token,
    settings.imageShare?.baseUrl,
    settings.imageShare?.token,
  ])

  async function handleSave(): Promise<void> {
    const hasImageShare = imageShareBaseUrl.trim().length > 0 || imageShareToken.trim().length > 0
    const next: Settings = {
      gateway: { baseUrl: gatewayBaseUrl.trim(), token: gatewayToken.trim() },
      ...(hasImageShare
        ? { imageShare: { baseUrl: imageShareBaseUrl.trim(), token: imageShareToken.trim() } }
        : {}),
    }
    setSettings(next)
    // Write through to `.imagegen/settings.json` — the store of record, and the only copy that
    // survives a wiped webview store or a move between `tauri dev` and the bundled app. Stay
    // open and say so if this fails: closing on a failed write is what makes the token silently
    // vanish by the next launch, which is the whole bug being fixed here.
    try {
      await storeSettings(next)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      return
    }
    setSaveError(null)
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Settings">
      <Stack gap="md">
        <Text size="sm" fw={500}>
          Gateway
        </Text>
        <TextInput
          label="Gateway URL"
          placeholder="https://image-gen-gateway.example.ts.net"
          value={gatewayBaseUrl}
          onChange={(event) => setGatewayBaseUrl(event.currentTarget.value)}
        />
        <PasswordInput
          label="Bearer token"
          value={gatewayToken}
          onChange={(event) => setGatewayToken(event.currentTarget.value)}
        />

        <Divider />

        <Text size="sm" fw={500}>
          image-share (optional)
        </Text>
        <Text size="xs" c="dimmed">
          Only needed to Share/Publish generations from the Library. Leave both fields blank to
          skip.
        </Text>
        <TextInput
          label="image-share URL"
          placeholder="https://image-share.example.ts.net"
          value={imageShareBaseUrl}
          onChange={(event) => setImageShareBaseUrl(event.currentTarget.value)}
        />
        <PasswordInput
          label="Bearer token"
          value={imageShareToken}
          onChange={(event) => setImageShareToken(event.currentTarget.value)}
        />

        <Text size="xs" c="dimmed">
          Both services are reachable only over your tailnet — make sure Tailscale is connected
          before generating or sharing.
        </Text>
        {saveError !== null && (
          <Text size="xs" c="red">
            Could not save to disk: {saveError}. Settings apply to this session but will not survive
            a restart.
          </Text>
        )}
        <Button onClick={() => void handleSave()} fullWidth>
          Save
        </Button>
      </Stack>
    </Modal>
  )
}
