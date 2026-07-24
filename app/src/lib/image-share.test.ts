/**
 * Covers `image-share.ts`'s pure URL-shaping helpers only. `uploadToImageShare`/
 * `publishToImageShare` call `@tauri-apps/plugin-http`'s `fetch` directly and are unverified
 * here — same rationale as `gateway.test.ts`'s `generate`/`edit`: driving the real app is the
 * only way to confirm those.
 */
import { describe, expect, test } from 'bun:test'
import { cdnMarkdownEmbed, shortKeyFromCdnUrl } from './image-share'

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
