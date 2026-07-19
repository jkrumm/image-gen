import { describe, expect, test } from 'bun:test'

// upstream.ts imports env.ts, which parses process.env at module load — set
// dummy values before importing so the test can run standalone.
process.env['API_SECRET'] ??= 'test-secret'
process.env['OPENAI_BASE_URL'] ??= 'http://localhost:1'
process.env['OPENAI_API_KEY'] ??= 'test-key'

const { magicBytesValid, parseWrappedUserError, UpstreamUserError } = await import('./upstream.js')

describe('magicBytesValid', () => {
  test('accepts a valid PNG header', () => {
    expect(magicBytesValid(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'png')).toBe(true)
  })

  test('rejects a non-PNG buffer for png', () => {
    expect(magicBytesValid(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'png')).toBe(false)
  })

  test('accepts a valid JPEG header', () => {
    expect(magicBytesValid(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'jpeg')).toBe(true)
  })

  test('rejects a non-JPEG buffer for jpeg', () => {
    expect(magicBytesValid(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'jpeg')).toBe(false)
  })

  test('accepts a valid WEBP header (RIFF....WEBP)', () => {
    const bytes = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // chunk size (unchecked)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ])
    expect(magicBytesValid(bytes, 'webp')).toBe(true)
  })

  test('rejects a buffer missing the WEBP tag', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ])
    expect(magicBytesValid(bytes, 'webp')).toBe(false)
  })

  test('rejects an unknown format', () => {
    expect(magicBytesValid(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'gif')).toBe(false)
  })
})

describe('parseWrappedUserError', () => {
  // Exact shape from docs/research/endpoint-verification.md Round 3: a STRING
  // with a "[OpenAI Vendor Group Key StatusCode: BadRequest] " prefix before
  // the embedded JSON — never parse the body directly.
  const ROUND_3_MODERATION_BODY =
    '[OpenAI Vendor Group Key StatusCode: BadRequest] ' +
    JSON.stringify({
      error: {
        code: 'moderation_blocked',
        type: 'image_generation_user_error',
        message: 'Your request was blocked by our moderation system.',
        moderation_details: { moderation_stage: 'input', categories: ['other'] },
      },
    })

  test('extracts code, message, and moderation_details from the string-prefixed body', () => {
    const err = parseWrappedUserError(ROUND_3_MODERATION_BODY)
    expect(err).toBeInstanceOf(UpstreamUserError)
    expect(err.code).toBe('moderation_blocked')
    expect(err.message).toBe('Your request was blocked by our moderation system.')
    expect(err.moderationDetails).toEqual({ moderation_stage: 'input', categories: ['other'] })
  })

  test('extracts an output-stage block the same way', () => {
    const body =
      '[OpenAI Vendor Group Key StatusCode: BadRequest] ' +
      JSON.stringify({
        error: {
          code: 'moderation_blocked',
          type: 'image_generation_user_error',
          message: 'blocked',
          moderation_details: { moderation_stage: 'output', categories: ['other'] },
        },
      })
    const err = parseWrappedUserError(body)
    expect(err.moderationDetails?.moderation_stage).toBe('output')
  })

  test('a non-moderation wrapped user error has no moderationDetails', () => {
    const body =
      '[OpenAI Vendor Group Key StatusCode: BadRequest] ' +
      JSON.stringify({
        error: {
          type: 'invalid_request_user_error',
          message: 'Transparent background is not supported.',
        },
      })
    const err = parseWrappedUserError(body)
    expect(err.code).toBeUndefined()
    expect(err.moderationDetails).toBeUndefined()
    expect(err.message).toBe('Transparent background is not supported.')
  })

  test('falls back to a generic message when no JSON object is embedded', () => {
    const err = parseWrappedUserError('totally unstructured user_error text')
    expect(err.moderationDetails).toBeUndefined()
    expect(err.message).toContain('totally unstructured user_error text')
  })

  test('falls back gracefully on unparseable embedded JSON', () => {
    const err = parseWrappedUserError('[prefix] {not valid json')
    expect(err.moderationDetails).toBeUndefined()
  })
})
