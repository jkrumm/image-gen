# Research: gpt-image-2 API Surface (July 2026)

Findings from deep research on the OpenAI image-generation API as of mid-2026, distilled to what shapes this project. Sources cited inline; full source list at the bottom.

## Model landscape

`gpt-image-2` (snapshot `gpt-image-2-2026-04-21`, released 2026-04-21) is the flagship image model — GPT-5.4 backbone, near-perfect text rendering, native 4K, ~20–30% cheaper than `gpt-image-1.5`. It replaces `gpt-image-1.5`, `gpt-image-1`, and DALL·E 3 as the default. `gpt-image-1` shuts down **2026-10-23**.

### Capability matrix

| Feature | gpt-image-2 | gpt-image-1.5 | gpt-image-1-mini |
|-|-|-|-|
| Arbitrary resolution | ✅ (up to 4K) | ❌ (3 presets) | ❌ |
| Transparent background | ❌ **errors** | ✅ | ✅ |
| `input_fidelity` param | disabled (natively high) | ✅ | ❌ |
| Quality tiers low/medium/high/auto | ✅ | ✅ | ✅ |
| Streaming + partial images | ✅ | ✅ | ✅ |
| Multi-image edits (≤16 inputs) | ✅ | ✅ | ✅ |

**Design consequence:** icon workflows needing transparency must route to `gpt-image-1.5` (or `-mini`). The gateway should treat model choice as a routing decision per request, not a constant.

## Endpoints

| Route | Models | Notes |
|-|-|-|
| `POST /v1/images/generations` | all gpt-image-*, dall-e-* | The core path. GPT Image models always return `b64_json` (`response_format` ignored). |
| `POST /v1/images/edits` | gpt-image-*, dall-e-2 | **Broken as of mid-2026**: API-side 400 validation bug for GPT Image models ([openai-node#1844](https://github.com/openai/openai-node/issues/1844)). |
| `POST /v1/responses` + `image_generation` tool | mainline model (e.g. `gpt-5.6`) decides | The working path for **editing/inpainting** (`action: "edit"`), multi-turn iteration via `previous_response_id`, `revised_prompt`, streaming partials. |
| `/v1/images/variations` | dall-e-2 only | Irrelevant. |

**Design consequence:** editing/inpainting in the gateway goes through the Responses API `image_generation` tool, not `/images/edits` — until the bug is fixed upstream. Verify against our upstream endpoint during implementation (see `endpoint-verification.md`).

## Key parameters (`/images/generations`, GPT Image models)

- `prompt` — up to 32,000 chars.
- `size` — gpt-image-2: arbitrary `WxH`, edges multiples of 16, ratio ≤ 3:1, 655,360–8,294,400 px total, max edge < 3840. Above 2560×1440 is experimental. Presets: `1024x1024`, `1536x1024`, `1024x1536`, `auto`.
- `quality` — `low | medium | high | auto`.
- `output_format` — `png | webp | jpeg` (+ `output_compression` 0–100).
- `background` — `transparent | opaque | auto` (transparent errors on gpt-image-2).
- `moderation` — `auto | low`.
- `stream` + `partial_images` (0–3) — SSE partial-image events.
- `n` — 1–10.

## Editing details (via whichever route works)

- Up to 16 input images, PNG/WebP/JPEG, <50 MB each; 3–5 well-chosen references beat 16.
- Mask: PNG with alpha, same dimensions as primary image, <4 MB; transparent = edit region; soft edges + 10–15 px overshoot blend best.

## Pricing (OpenAI direct, per 1M tokens)

| Model | Image in | Image out | Text in |
|-|-|-|-|
| gpt-image-2 | $8.00 | $30.00 | $5.00 |
| gpt-image-1.5 | $8.00 | $32.00 | $5.00 |
| gpt-image-1-mini | $2.50 | $8.00 | $2.00 |

Per-image at 1024×1024: low ~$0.006, medium ~$0.053, high ~$0.211. Usage objects return full token detail — cost telemetry is straightforward.

## Client library

Both the official `openai` npm SDK (v6.x) and Vercel AI SDK (`experimental_generateImage`) work natively on Bun and hit the same endpoints (both equally affected by the edits bug). Recommendation from research:

- **Official `openai` SDK** for direct generation + streaming + the Responses API editing path — most direct parameter exposure. Point `baseURL` at our upstream.
- AI SDK only adds value for Vercel-Gateway routing/cost-tracking we don't need.

## Caveats summary

1. `/v1/images/edits` broken for GPT Image models → use Responses API for edits.
2. No transparency on gpt-image-2 → model routing for icons.
3. 4K (>2560×1440) experimental.
4. Not supported by the Batch API.
5. Always base64 output → gateway either streams b64 through or re-encodes; images never need server-side storage.

## Sources

- https://developers.openai.com/api/reference/resources/images/methods/generate
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- https://github.com/openai/openai-node/issues/1844
- https://ai-sdk.dev/docs/ai-sdk-core/image-generation
