import { describe, expect, test } from 'bun:test'

// upstream.ts imports env.ts, which parses process.env at module load.
process.env['API_SECRET'] ??= 'test-secret'
process.env['OPENAI_BASE_URL'] ??= 'http://localhost:1'
process.env['OPENAI_API_KEY'] ??= 'test-key'

const { buildUpstreamErrorBody } = await import('./moderation-error.js')
const { UpstreamUserError } = await import('./upstream.js')

describe('buildUpstreamErrorBody', () => {
  test('a moderation-blocked UpstreamUserError surfaces code + moderation_details', () => {
    const err = new UpstreamUserError({
      message: 'blocked',
      code: 'moderation_blocked',
      moderationDetails: { moderation_stage: 'output', categories: ['other'] },
    })
    const body = buildUpstreamErrorBody(err)
    expect(body).toEqual({
      error: {
        message: 'blocked',
        type: 'upstream_error',
        code: 'moderation_blocked',
        moderation_details: { moderation_stage: 'output', categories: ['other'] },
      },
    })
  })

  test('a non-moderation UpstreamUserError keeps the plain shape', () => {
    const err = new UpstreamUserError({
      message: 'transparency unsupported',
      code: 'invalid_request',
    })
    const body = buildUpstreamErrorBody(err)
    expect(body).toEqual({ error: { message: 'transparency unsupported', type: 'upstream_error' } })
  })

  test('a plain Error keeps the plain shape', () => {
    const body = buildUpstreamErrorBody(new Error('network down'))
    expect(body).toEqual({ error: { message: 'network down', type: 'upstream_error' } })
  })

  test('a non-Error throwable falls back to a generic message', () => {
    const body = buildUpstreamErrorBody('boom')
    expect(body).toEqual({ error: { message: 'upstream request failed', type: 'upstream_error' } })
  })
})
