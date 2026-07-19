import { z } from 'zod'

const Env = z.object({
  PORT: z.coerce.number().default(7716),
  API_SECRET: z.string().min(1),
  // Full OpenAI-compatible base URL (including any path prefix). `/images/generations`
  // is appended by src/lib/upstream.ts — never hardcode `/openai/v1` or similar here.
  OPENAI_BASE_URL: z.url(),
  OPENAI_API_KEY: z.string().min(1),
  // Text model for `POST /enhance` (brief -> fuller prompt), called via
  // `/chat/completions` on the same upstream. Confirmed present by a live
  // `/responses` probe (2026-07-16) — see routes/enhance.ts.
  ENHANCE_MODEL: z.string().min(1).default('gpt-5.6'),
  ARGO_USAGE_URL: z.url().optional(),
  ARGO_API_SECRET: z.string().optional(),
  // Labels usage telemetry records so local dev runs don't get counted as VPS traffic.
  MACHINE: z.string().min(1).default('vps'),
})

export const env = Env.parse(process.env)
