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

## Round 2 — capability probe (2026-07-16)

Everything previously listed as "still unverified" is now settled by live probe, and **four claims from public documentation turned out to be false for this endpoint**. Probe results below are ground truth; prefer them over any vendor doc or blog.

| Probe | Result | Verdict |
|-|-|-|
| `gpt-image-2` + `background: transparent` | 503-wrapped 400 `"Transparent background is not supported for this model."` | Unsupported — permanent |
| `gpt-image-1.5` + `background: transparent` | 200, `background: "transparent"` | **Fallback works** — routing is load-bearing |
| `/images/edits` + `gpt-image-2` (multipart) | 200 | **openai-node#1844 is fixed** — no Responses API detour needed |
| `/images/edits` + `image[]` ×2 refs | 200 | Multi-image references work |
| `/images/edits` + `gpt-image-2` + `size: 1536x896` / `2560x1440` | 200, echoes the size | **Custom sizes work on edits** — docs claiming presets-only are wrong |
| `/images/edits` + `gpt-image-1.5` + `size: 1536x896` | 400 `"Supported sizes are 1024x1024, 1024x1536, 1536x1024, and auto"` | Size rule is per-**model**, not per-endpoint |
| `/images/edits` + `gpt-image-2` + `input_fidelity: high` | 400 `"The model 'gpt-image-2' does not support the 'input_fidelity' parameter."` | Must not be forwarded for gpt-image-2 |
| `/images/edits` + `gpt-image-1.5` + `input_fidelity: high` | 200 | Valid for 1.5 |
| `/images/generations` + `input_fidelity` (any model) | 400 `"Unknown parameter"` | Edits-only parameter |
| `n: 2` on gpt-image-2 / 1.5 / -mini | 200, 2 images each | **All three support n > 1** — "1.5 is effectively n=1" is wrong |
| `/responses` + `image_generation` tool | 200 | Proxied — available for multi-turn, not required for edits |
| `stream: true` + `partial_images: 2` | 200 `text/event-stream`; `image_generation.partial_image`, `image_generation.completed` | Streaming passes through |
| `stream: true` on `/images/edits` | 200 `text/event-stream`; **`image_edit.partial_image`, `image_edit.completed`** | Streaming works on edits too — but under a **different event namespace** |
| `stream: true` + `n: 2` | 400 `"Streaming is only supported with n=1."` | Streaming implies a single image |

### SSE event names are per-endpoint (the one thing that is NOT per-model)

`/images/generations` emits `image_generation.*`; `/images/edits` emits `image_edit.*`. **Payloads are identical** — only the namespace differs. This is the sole exception to the per-model rule, and it is easy to get wrong by generalizing from the generations probe: matching only `image_generation.*` makes every streamed edit terminate with "no completed event". `gateway/src/lib/streaming.ts` matches on the event suffix and has a regression test.

Frame shapes (b64 elided):

```
event: image_generation.partial_image
data: {"created_at":…,"type":"image_generation.partial_image","b64_json":"…","background":"opaque",
       "output_format":"png","partial_image_index":0,"quality":"low","sequence_number":0,"size":"1024x1024"}

event: image_generation.completed
data: {"created_at":…,"type":"image_generation.completed","b64_json":"…","background":"opaque",
       "output_format":"png","quality":"low","sequence_number":1,"size":"1024x1024","usage":{…}}
```

The **final image and `usage` arrive inside the `completed` frame** — a streamed request has no separate response body. There is no image-index field (streaming is n=1 only). Upstream may send **fewer partials than requested** when generation is fast — never block waiting for a fixed count.

### Corrections to `image-api.md` (dated snapshot, now partly stale)

1. `/images/edits` is **not** broken for GPT Image models anymore.
2. Custom resolutions are **not** restricted to `/images/generations`; they work on `/images/edits` too, for gpt-image-2.
3. `n` is **not** effectively 1 for gpt-image-1.5 / gpt-image-1-mini.
4. `input_fidelity` is not merely "disabled" on gpt-image-2 — sending it is a hard 400.

### Error-shape note

The vendor proxy returns **HTTP 503** for upstream 400-class validation failures, with the real status in the body (`[OpenAI Vendor Group Key StatusCode: BadRequest]`) and `"type": "image_generation_user_error"`. Retrying these is pointless — `upstream.ts` detects `user_error` and fails fast.

## Round 3 — moderation probe (2026-07-17)

Wave-0 probes for the studio redesign (`docs/implementation-plan.md`). All against our own upstream, gpt-image-2 unless noted, quality low.

1. **`moderation=low` is accepted on `/images/edits`** by both gpt-image-2 and gpt-image-1.5 (200). The historical gpt-image-1 "unsupported on edits" limitation does not apply here.
2. **`moderation_details` exists and passes through.** A blocked request returns the usual 503-wrapped string; the embedded JSON contains `code: "moderation_blocked"`, `type: "image_generation_user_error"`, and `moderation_details: { moderation_stage: "input"|"output", categories: ["other"] }`. The 503 body is a **string with a `[OpenAI Vendor Group Key StatusCode: BadRequest] ` prefix before the JSON** — extract the JSON substring; do not parse the body directly. Categories observed so far are coarse (`"other"`).
3. **Our upstream is more permissive than the public OpenAI API reports suggest.** A photorealistic named-celebrity portrait generated fine (200) — public reports call this a reliable block. A living-artist style prompt blocked at **input** stage; a franchise character (Mickey Mouse) passed input, generated, and blocked at **output** stage. Calibration consequence: the enhancer pre-check is *advisory* — it predicts public-API behavior, our endpoint may allow more; warn, don't hard-refuse, except for genuine policy hard walls.
4. **Quirk: `/images/edits` with `size: "auto"` returned `1254x1254`** from a 1024×1024 input+mask (gpt-image-2) — a non-preset size that is not even a multiple of 16, and it does *not* match the input dimensions. Reproduced in a real app run 2026-07-19 (`~/Pictures/ImageGen/2026-07-19_13-45-43_vmow`): the Edit view defaults to `sizeChoice: 'auto'` and the gateway forwards `"auto"` verbatim — it does **not** inject a concrete size — so the odd size reaches disk. The inpaint still aligned correctly (upstream maps the mask onto its own chosen output), so this is cosmetic for the single edit but a hazard downstream (next point).
5. **`size` recorded from an `auto` edit is truthful but NOT replayable.** `gateway/src/lib/response.ts` records `upstream.size ?? requestedSize`, so the sidecar's `params.size` is the *actual* returned dimensions. Re-sending `1254x1254` as a request 400s: `503 [OpenAI Vendor Group Key StatusCode: BadRequest] "Invalid size '1254x1254'. Width and height must both be divisible by 16."` (probed 2026-07-19). **Consequence for Wave-1 G4:** Re-run (verbatim) / Promote must snap `params.size` through `rules.ts` (or fall back to `"auto"`) before replay — replaying a recorded auto-edit size verbatim will fail. The clean fix is for the app to derive a concrete divisible-by-16 size for edits instead of sending `"auto"`.
