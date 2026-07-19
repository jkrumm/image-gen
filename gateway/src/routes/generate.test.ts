import { describe, expect, test } from 'bun:test'

// generate.ts -> upstream.ts -> env.ts parses process.env at module load.
process.env['API_SECRET'] ??= 'test-secret'
process.env['OPENAI_BASE_URL'] ??= 'http://localhost:1'
process.env['OPENAI_API_KEY'] ??= 'test-key'

const { generateRoutes } = await import('./generate.js')
const { generateResponseSchema } = await import('@image-gen/shared')

// 1x1 PNG, base64-encoded, so magic-byte validation passes.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function withMockedFetch(
  impl: (...args: Parameters<typeof fetch>) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const original = global.fetch
  global.fetch = impl as unknown as typeof fetch
  return run().finally(() => {
    global.fetch = original
  })
}

describe('POST /generate', () => {
  test('non-streaming path returns a response validated against generateResponseSchema', async () =>
    withMockedFetch(
      async () =>
        new Response(
          JSON.stringify({
            created: 1700000000,
            data: [{ b64_json: PNG_B64 }],
            usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      async () => {
        const res = await generateRoutes.handle(
          new Request('http://localhost/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: 'a cat wearing a hat' }),
          }),
        )
        expect(res.status).toBe(200)
        const parsed = generateResponseSchema.safeParse(await res.json())
        expect(parsed.success).toBe(true)
        expect(parsed.data?.images).toHaveLength(1)
        expect(parsed.data?.images[0]?.b64_json).toBe(PNG_B64)
      },
    ))

  test('streaming path (partial_images > 0) responds as SSE, not the JSON envelope', async () =>
    withMockedFetch(
      async () => {
        const completed = `event: image_generation.completed\ndata: ${JSON.stringify({
          b64_json: PNG_B64,
          output_format: 'png',
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        })}\n\n`
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(completed))
            controller.close()
          },
        })
        return new Response(body)
      },
      async () => {
        const res = await generateRoutes.handle(
          new Request('http://localhost/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: 'a cat wearing a hat', partial_images: 1 }),
          }),
        )
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/event-stream')
        const text = await res.text()
        expect(text).toContain('"type":"completed"')
      },
    ))

  test('a moderation-blocked upstream response surfaces code + moderation_details on the 502', async () =>
    withMockedFetch(
      async () =>
        new Response(
          '[OpenAI Vendor Group Key StatusCode: BadRequest] ' +
            JSON.stringify({
              error: {
                code: 'moderation_blocked',
                type: 'image_generation_user_error',
                message: 'Your request was blocked by our moderation system.',
                moderation_details: { moderation_stage: 'input', categories: ['other'] },
              },
            }),
          { status: 503 },
        ),
      async () => {
        const res = await generateRoutes.handle(
          new Request('http://localhost/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: 'a restricted subject' }),
          }),
        )
        expect(res.status).toBe(502)
        const body = (await res.json()) as {
          error: {
            code?: string
            moderation_details?: { moderation_stage: string; categories: string[] }
          }
        }
        expect(body.error.code).toBe('moderation_blocked')
        expect(body.error.moderation_details).toEqual({
          moderation_stage: 'input',
          categories: ['other'],
        })
      },
    ))
})
