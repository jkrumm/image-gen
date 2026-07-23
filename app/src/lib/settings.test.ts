/**
 * Settings persistence. The `useSettings` hook itself is localStorage-backed and needs a DOM, so
 * what is pinned here is the part that actually fixes the "enter the token again" bug: the
 * file-backed load/store pair, exercised through the injectable `StudioStore` (same reasoning as
 * `studio-store.test.ts` — no Tauri runtime in `bun test`).
 *
 * The load path's contract is "degrade to undefined, never throw": it runs on boot, and anything
 * that throws there leaves a blank window instead of a settings prompt.
 */
import { describe, expect, test } from 'bun:test'
import { isSettingsConfigured, loadStoredSettings, storeSettings } from './settings'
import type { StudioStore } from './studio-store'

/** Only the two methods these functions touch; the rest of StudioStore is irrelevant here. */
function fakeStore(initial?: unknown): StudioStore & { written: unknown[] } {
  let stored = initial
  const written: unknown[] = []
  return {
    written,
    readSettings: async () => stored,
    writeSettings: async (value: unknown) => {
      written.push(value)
      stored = value
    },
  } as unknown as StudioStore & { written: unknown[] }
}

const VALID = { baseUrl: 'https://image-gateway.example.com', token: 'secret-token' }

describe('loadStoredSettings', () => {
  test('returns a fully configured pair', async () => {
    expect(await loadStoredSettings(fakeStore(VALID))).toEqual(VALID)
  })

  test('returns undefined when the file is absent', async () => {
    expect(await loadStoredSettings(fakeStore(undefined))).toBeUndefined()
  })

  test('returns undefined for a malformed file rather than throwing', async () => {
    expect(await loadStoredSettings(fakeStore({ baseUrl: 42 }))).toBeUndefined()
  })

  test('returns undefined when the file parses but is half-filled', async () => {
    // A file with a URL and no token must not count as configured — otherwise the app skips the
    // settings prompt and every request 401s with no explanation.
    expect(
      await loadStoredSettings(fakeStore({ baseUrl: VALID.baseUrl, token: '' })),
    ).toBeUndefined()
    expect(
      await loadStoredSettings(fakeStore({ baseUrl: '   ', token: VALID.token })),
    ).toBeUndefined()
  })

  test('a throwing read degrades to undefined instead of propagating', async () => {
    const throwing = {
      readSettings: async () => {
        throw new Error('forbidden path')
      },
    } as unknown as StudioStore
    expect(await loadStoredSettings(throwing)).toBeUndefined()
  })
})

describe('storeSettings', () => {
  test('round-trips through the store', async () => {
    const store = fakeStore()
    await storeSettings(VALID, store)
    expect(store.written).toEqual([VALID])
    expect(await loadStoredSettings(store)).toEqual(VALID)
  })

  test('rejects a malformed pair rather than writing it', async () => {
    const store = fakeStore()
    await expect(
      storeSettings({ baseUrl: 'https://x', token: 1 } as unknown as typeof VALID, store),
    ).rejects.toThrow()
    expect(store.written).toEqual([])
  })
})

describe('isSettingsConfigured', () => {
  test('requires both fields to be non-blank', () => {
    expect(isSettingsConfigured(VALID)).toBe(true)
    expect(isSettingsConfigured({ baseUrl: '', token: 't' })).toBe(false)
    expect(isSettingsConfigured({ baseUrl: 'https://x', token: '  ' })).toBe(false)
  })
})
