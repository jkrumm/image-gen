import { createPersistedState } from 'basalt-ui'
import { z } from 'zod'
import { studioStore, type StudioStore } from './studio-store'

const serviceConnectionSchema = z.object({
  baseUrl: z.string(),
  token: z.string(),
})
/** One bearer-authed HTTP service's connection details — the gateway, or the private
 * image-share layer. Both `gateway.ts` and `image-share.ts` take exactly this shape, not the
 * full `Settings` envelope, so neither needs to know the other service exists. */
export type ServiceConnection = z.infer<typeof serviceConnectionSchema>

const settingsSchema = z.object({
  gateway: serviceConnectionSchema,
  /** Optional — the private image-share layer (Share/Publish in the Library inspector). Its
   * absence only disables delivery actions; the gateway is the one connection the app can't run
   * without. */
  imageShare: serviceConnectionSchema.optional(),
})
export type Settings = z.infer<typeof settingsSchema>

const DEFAULT_SETTINGS: Settings = { gateway: { baseUrl: '', token: '' } }

/**
 * v1 was a flat `{ baseUrl, token }` pair — a single, implicitly-gateway connection, no
 * image-share. v2 nests it under `gateway` and adds an optional `imageShare` connection.
 * Detected by shape, not a version field: the on-disk `settings.json` carries no envelope at
 * all (it's whatever `make configure` or a past `storeSettings()` wrote directly), so
 * shape-sniffing is the only signal available there. Anything already `gateway`-shaped, or
 * unrecognized, passes through unchanged — `settingsSchema` downstream is the single source of
 * truth for whether the result is actually valid.
 */
function migrateSettingsShape(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const record = raw as Record<string, unknown>
  if ('gateway' in record) return record
  if ('baseUrl' in record || 'token' in record) {
    return { gateway: { baseUrl: record['baseUrl'], token: record['token'] } }
  }
  return record
}

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
 * JSON file. It is a bearer for tailnet-only services, so this is the same exposure the old
 * shape had, just somewhere durable. Keychain would be the upgrade if that ever stops being
 * true.
 */
export const useSettings = createPersistedState<Settings>({
  key: 'settings',
  version: 2,
  initial: DEFAULT_SETTINGS,
  migrate: (persisted) => {
    const parsed = settingsSchema.safeParse(migrateSettingsShape(persisted))
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  },
  schema: settingsSchema,
})

export function isSettingsConfigured(connection: ServiceConnection | undefined): boolean {
  return (
    connection !== undefined &&
    connection.baseUrl.trim().length > 0 &&
    connection.token.trim().length > 0
  )
}

/**
 * Read the on-disk settings, if any. Returns undefined when the file is absent, malformed, or
 * the gateway connection isn't usable — a broken settings file must degrade to "not configured
 * yet" (the app then prompts) rather than throw on boot and leave a blank window. `imageShare`
 * carries no such gate: it's optional everywhere it's read, so a half-filled or absent
 * image-share connection never blocks hydrating the gateway connection that IS present.
 */
export async function loadStoredSettings(
  store: StudioStore = studioStore,
): Promise<Settings | undefined> {
  const raw = await store.readSettings().catch(() => undefined)
  if (raw === undefined) return undefined
  const parsed = settingsSchema.safeParse(migrateSettingsShape(raw))
  if (!parsed.success) return undefined
  return isSettingsConfigured(parsed.data.gateway) ? parsed.data : undefined
}

/** Persist settings to disk. Failures are surfaced to the caller — a silent write failure here
 * means the next launch quietly asks for the token again, which is the exact bug this fixes. */
export async function storeSettings(
  settings: Settings,
  store: StudioStore = studioStore,
): Promise<void> {
  await store.writeSettings(settingsSchema.parse(settings))
}
