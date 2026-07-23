import { createPersistedState } from 'basalt-ui'
import { z } from 'zod'
import { studioStore, type StudioStore } from './studio-store'

const settingsSchema = z.object({
  baseUrl: z.string(),
  token: z.string(),
})
export type Settings = z.infer<typeof settingsSchema>

const DEFAULT_SETTINGS: Settings = { baseUrl: '', token: '' }

/**
 * Gateway connection settings.
 *
 * The localStorage hook below is a *cache*, not the store of record — the file at
 * `~/Pictures/ImageGen/.imagegen/settings.json` is. Two reasons, both discovered the hard way:
 *
 *  - WebKit partitions localStorage per executable, not per project: `tauri dev` writes to
 *    `~/Library/WebKit/image-gen` while the bundled app writes to
 *    `~/Library/WebKit/com.jkrumm.image-gen`. Settings typed into one are invisible to the
 *    other, so you re-enter the token every time you cross between them.
 *  - The file can be seeded from outside the app entirely (`make configure` writes it from
 *    1Password), which means a fresh machine or a wiped webview store never needs the token
 *    typed by hand at all.
 *
 * The token lands on disk in plaintext either way — localStorage was never more private than a
 * JSON file. It is a bearer for a tailnet-only service, so this is the same exposure the old
 * shape had, just somewhere durable. Keychain would be the upgrade if that ever stops being
 * true.
 */
export const useSettings = createPersistedState<Settings>({
  key: 'settings',
  version: 1,
  initial: DEFAULT_SETTINGS,
  schema: settingsSchema,
})

export function isSettingsConfigured(settings: Settings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.token.trim().length > 0
}

/**
 * Read the on-disk settings, if any. Returns undefined when the file is absent or malformed —
 * a broken settings file must degrade to "not configured yet" (the app then prompts) rather
 * than throw on boot and leave a blank window.
 */
export async function loadStoredSettings(
  store: StudioStore = studioStore,
): Promise<Settings | undefined> {
  const raw = await store.readSettings().catch(() => undefined)
  if (raw === undefined) return undefined
  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) return undefined
  return isSettingsConfigured(parsed.data) ? parsed.data : undefined
}

/** Persist settings to disk. Failures are surfaced to the caller — a silent write failure here
 * means the next launch quietly asks for the token again, which is the exact bug this fixes. */
export async function storeSettings(
  settings: Settings,
  store: StudioStore = studioStore,
): Promise<void> {
  await store.writeSettings(settingsSchema.parse(settings))
}
