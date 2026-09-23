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
  //
  // Pinned to a concrete id, never the `gpt-5.6` alias this used to carry: that
  // alias resolves server-side (probed 2026-09-12 -> `gpt-5.6-sol`) and can be
  // re-pointed at another tier without notice, silently changing both output
  // and bill.
  //
  // deepseek-v4.1-flash at effort "high": expanding a brief into a structured
  // JSON plan is mid-size, multi-field, single-shot work — the settled lane
  // for DeepSeek across the estate, not the small/latency-critical lane luna
  // covers. See modelpick/docs/decisions/model-configs.md.
  ENHANCE_MODEL: z.string().min(1).default('deepseek-v4.1-flash'),
  // Top-level `reasoning_effort` sent with every ENHANCE_MODEL call. Restricted
  // to deepseek-v4.1-flash's accepted ladder on this endpoint — `medium`/`none`
  // are refused outright.
  ENHANCE_REASONING_EFFORT: z.enum(['low', 'high', 'xhigh', 'max']).default('high'),
  ARGO_USAGE_URL: z.url().optional(),
  ARGO_API_SECRET: z.string().optional(),
  // Labels usage telemetry records so local dev runs don't get counted as VPS traffic.
  MACHINE: z.string().min(1).default('vps'),
})

export const env = Env.parse(process.env)
