import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { z } from 'zod'

/**
 * Regression guard for the response-validation bug fixed in routes/generate.ts
 * and routes/edit.ts: Elysia (1.4.26, dist/compose.js `composeValidationFactory`)
 * skips `response[<status>]` validation entirely for any returned value with a
 * `typeof value.next === 'function'` — which is true for ANY generator instance,
 * not just when the handler itself is declared `async function*`. The fix relies
 * on this being a check on the *returned value*, not the handler's declaration
 * kind — these two tests pin exactly that runtime behavior so a future Elysia
 * upgrade (or refactor back to `async function*`) can't silently reintroduce the
 * regression without a test failing.
 */
async function* gen(): AsyncGenerator<{ ok: true }> {
  // Same deliberate violation as the plain-object test below — if this were
  // validated, it would 422 the same way. It doesn't: the stream carries it
  // through untouched.
  yield { ok: false } as unknown as { ok: true }
}

describe('Elysia response[200] validation vs. returned-value shape', () => {
  const schema = z.object({ ok: z.literal(true) })

  test('a plain async function returning a schema-violating object IS validated (422)', async () => {
    // Deliberately wrong at runtime; cast once so the schema-violating shape
    // reaches Elysia instead of TypeScript catching it statically.
    const app = new Elysia().post(
      '/x',
      async () => ({ ok: 'not-a-boolean' }) as unknown as { ok: true },
      {
        response: { 200: schema },
      },
    )
    const res = await app.handle(new Request('http://localhost/x', { method: 'POST' }))
    expect(res.status).toBe(422)
  })

  test('a plain async function returning an async-generator instance bypasses validation and streams', async () => {
    const app = new Elysia().post('/y', async () => gen(), {
      response: { 200: schema },
    })
    const res = await app.handle(new Request('http://localhost/y', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"ok":false}')
  })
})
