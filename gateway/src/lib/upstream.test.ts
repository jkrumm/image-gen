import { describe, expect, test } from 'bun:test'

// upstream.ts imports env.ts, which parses process.env at module load — set
// dummy values before importing so the test can run standalone.
process.env['API_SECRET'] ??= 'test-secret'
process.env['OPENAI_BASE_URL'] ??= 'http://localhost:1'
process.env['OPENAI_API_KEY'] ??= 'test-key'

const {
  isWrappedUserErrorBody,
  magicBytesValid,
  parseWrappedUserError,
  requestWithRetry,
  UpstreamUserError,
} = await import('./upstream.js')

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

describe('isWrappedUserErrorBody', () => {
  test('recognizes the historical user_error substring shape', () => {
    expect(
      isWrappedUserErrorBody(
        '[OpenAI Vendor Group Key StatusCode: BadRequest] {"error":{"type":"image_generation_user_error"}}',
      ),
    ).toBe(true)
  })

  // gpt-image-2.5-flare/sunburst-era shape (docs/research/endpoint-verification.md
  // 2026-09-23): a 400-class validation error wrapped in a 503 with NO
  // "user_error" substring anywhere in the body — must still be recognized as
  // non-retryable, or the gateway burns three retries and ~3.5s reporting the
  // same permanent failure.
  test('recognizes the gpt-image-2.5 BadRequest/invalid_request_error shape with no user_error substring', () => {
    const body =
      '[OpenAI Vendor Group Key StatusCode: BadRequest] ' +
      JSON.stringify({ error: { type: 'invalid_request_error', message: 'bad quality value' } })
    expect(body).not.toContain('user_error')
    expect(isWrappedUserErrorBody(body)).toBe(true)
  })

  test('a genuine transient 503 with neither marker is not a wrapped user error', () => {
    expect(isWrappedUserErrorBody('Service Unavailable')).toBe(false)
  })
})

describe('requestWithRetry — non-retryable BadRequest shape', () => {
  test('a gpt-image-2.5-era 503 BadRequest body throws UpstreamUserError without retrying', async () => {
    const original = global.fetch
    let calls = 0
    global.fetch = (async () => {
      calls++
      return new Response(
        '[OpenAI Vendor Group Key StatusCode: BadRequest] ' +
          JSON.stringify({
            error: { type: 'invalid_request_error', message: 'bad quality value' },
          }),
        { status: 503 },
      )
    }) as unknown as typeof fetch

    try {
      await expect(
        requestWithRetry('http://localhost/generate', { method: 'POST' }),
      ).rejects.toBeInstanceOf(UpstreamUserError)
      expect(calls).toBe(1)
    } finally {
      global.fetch = original
    }
  })
})
