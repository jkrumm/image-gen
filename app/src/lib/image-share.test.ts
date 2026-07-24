/**
 * Covers `image-share.ts`'s pure URL-shaping helpers and its response-parsing logic (`parseJson`,
 * exported the same way `gateway.ts` exports `parseJsonEnvelope`, purely so it can be driven
 * directly against constructed `Response` objects). `uploadToImageShare`/`publishToImageShare`
 * call `@tauri-apps/plugin-http`'s `fetch` directly and are unverified here — same rationale as
 * `gateway.test.ts`'s `generate`/`edit`: driving the real app is the only way to confirm those.
 */
import { describe, expect, test } from 'bun:test'
import { cdnMarkdownEmbed, parseJson, shortKeyFromCdnUrl } from './image-share'

const CDN_URL = 'https://img.jkrumm.com/gen/ab12cd34.png'

describe('cdnMarkdownEmbed', () => {
  test('wraps an rs:fit:800/f:jpg rendition in a markdown image embed', () => {
    expect(cdnMarkdownEmbed(CDN_URL)).toBe(
      '![](https://img.jkrumm.com/rs:fit:800/f:jpg/gen/ab12cd34.png)',
    )
  })
})

describe('shortKeyFromCdnUrl', () => {
  test('strips the CDN origin, leaving the bare key', () => {
    expect(shortKeyFromCdnUrl(CDN_URL)).toBe('gen/ab12cd34.png')
  })
})

describe('parseJson', () => {
  test('parses an ok JSON body', async () => {
    const response = new Response(JSON.stringify({ id: 42 }), { status: 200 })
    expect(await parseJson<{ id: number }>(response)).toEqual({ id: 42 })
  })

  test('throws the message field from a JSON error body', async () => {
    const response = new Response(JSON.stringify({ message: 'file too large' }), { status: 400 })
    await expect(parseJson(response)).rejects.toThrow('file too large')
  })

  test('throws the raw text of a plain-text error body (e.g. status(401, "Unauthorized"))', async () => {
    const response = new Response('Unauthorized', { status: 401 })
    await expect(parseJson(response)).rejects.toThrow('Unauthorized')
  })

  test('falls back to a status-based message on an empty error body', async () => {
    const response = new Response('', { status: 500 })
    await expect(parseJson(response)).rejects.toThrow('image-share request failed with status 500')
  })
})
