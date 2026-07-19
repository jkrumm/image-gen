import { Elysia } from 'elysia'
import { z } from 'zod'

/** Flipped to true while draining on SIGTERM/SIGINT (src/index.ts). */
let draining = false

export function setDraining(v: boolean): void {
  draining = v
}

export const healthRoute = new Elysia().get(
  '/health',
  ({ status }) => {
    if (draining) return status(503, { status: 'draining' as const })
    return { status: 'ok' as const }
  },
  {
    response: {
      200: z.object({ status: z.literal('ok') }),
      503: z.object({ status: z.literal('draining') }),
    },
    detail: {
      tags: ['System'],
      summary: 'Liveness probe',
      description:
        "Returns `{ status: 'ok' }` if the service process is up, or 503 while draining during graceful shutdown. No auth required. Used by Docker healthcheck and external uptime monitors.",
    },
  },
)
