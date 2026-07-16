# Verification: Upstream Endpoint Supports gpt-image-2 (2026-07-16)

Live probe of the unified OpenAI-compatible LLM endpoint (base URL and key resolve from 1Password: `op://common/anthropic/OPENAI_BASE_URL` + `op://common/anthropic/API_KEY`; the OpenAI transport lives under the `/openai/v1` path).

## Result: fully working

`POST /images/generations` with `{"model": "gpt-image-2", "prompt": "a red circle", "size": "1024x1024", "quality": "low", "n": 1}` returned **HTTP 200** with:

```
{ created, background: "opaque", data: [{ b64_json: <PNG> }],
  output_format: "png", quality: "low", size: "1024x1024",
  usage: { input_tokens: 9, output_tokens: 196, total_tokens: 205,
           input_tokens_details, output_tokens_details } }
```

`quality` and `size` accepted as-is; token-level usage detail is present, so per-generation cost telemetry is straightforward.

## Image-capable models in the catalog (287 total)

- OpenAI: `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`, `dall-e-3`
- Google: `gemini-3-pro-image(-preview)`, `gemini-3.1-flash-image(-preview)`, `gemini-3.1-flash-lite-image`, `gemini-2.5-flash-image`, `nano-banana`, `nano-banana-2`, `nano-banana-pro`

Transparency-capable fallback (`gpt-image-1.5`) and cheap tier (`gpt-image-1-mini`) are both available, as are Gemini image models as future alternates.

## Prior art to reuse

`sideclaw/server/lib/iu-openai.ts` already implements `generateImage()` against this endpoint: POSTs `/images/generations` (default model `gpt-image-2`), validates PNG magic bytes, normalizes usage, logs to the usage-tracker NDJSON sink, and fails fast on 410 (retired model) naming the current gpt-image lineup. Reuse these patterns (retry set, 410 handling, magic-byte check, usage sink) in the gateway.

## Still unverified (probe during implementation)

- Whether `/images/edits` behaves the same through this endpoint as OpenAI direct (where it 400s for GPT Image models — see `image-api.md`).
- Whether the Responses API (`/responses` + `image_generation` tool) is proxied — this is the designated editing path.
- Streaming (`stream: true` + `partial_images`) passthrough behavior.
