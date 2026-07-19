import { Button, Modal, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useSettings } from '../lib/settings'

type SettingsModalProps = {
  opened: boolean
  onClose: () => void
}

export function SettingsModal({ opened, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useSettings()
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [token, setToken] = useState(settings.token)

  // Re-sync the draft fields from persisted settings each time the modal opens.
  useEffect(() => {
    if (!opened) return
    setBaseUrl(settings.baseUrl)
    setToken(settings.token)
  }, [opened, settings.baseUrl, settings.token])

  function handleSave(): void {
    setSettings({ baseUrl: baseUrl.trim(), token: token.trim() })
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Settings">
      <Stack gap="md">
        <TextInput
          label="Gateway URL"
          placeholder="https://image-gen-gateway.example.ts.net"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.currentTarget.value)}
        />
        <PasswordInput
          label="Bearer token"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          The gateway is reachable only over your tailnet — make sure Tailscale is connected before
          generating.
        </Text>
        <Button onClick={handleSave} fullWidth>
          Save
        </Button>
      </Stack>
    </Modal>
  )
}
