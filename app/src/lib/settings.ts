import { createPersistedState } from 'basalt-ui'
import { z } from 'zod'

const settingsSchema = z.object({
  baseUrl: z.string(),
  token: z.string(),
})
export type Settings = z.infer<typeof settingsSchema>

const DEFAULT_SETTINGS: Settings = { baseUrl: '', token: '' }

/** Gateway connection settings — tiny localStorage-backed hook via basalt-ui's persisted state. */
export const useSettings = createPersistedState<Settings>({
  key: 'settings',
  version: 1,
  initial: DEFAULT_SETTINGS,
  schema: settingsSchema,
})

export function isSettingsConfigured(settings: Settings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.token.trim().length > 0
}
