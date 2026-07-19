# image-gen

Personal image-generation studio: a stateless VPS gateway (`gateway/`) wrapping the gpt-image model family + a Tauri v2 macOS app (`app/`) that owns all state on local disk.

**Start here:** `docs/handover.md` (current state + what's unverified + open decisions) → `PRD.md` (scope, phases, success criteria) → `docs/research/` (endpoint verification is ground truth; `image-api.md` is a stale secondary source). Implementation follows the PRD phases; each phase ships working software.

## Repo layout

| Path | What |
|-|-|
| `gateway/` | Elysia + Bun HTTP service. Stateless — no DB, no image storage. Docker on the VPS, Tailscale-only, bearer auth. |
| `app/` | Tauri v2 macOS app. React + Mantine v9 + basalt-ui (basalt-ui is Mantine-based as of its 2026-07 zinc redesign — **no Tailwind**; wire via `BasaltProvider` + layered CSS imports, reference: argo dashboard). Owns the library at `~/Pictures/ImageGen/`. |
| `shared/` | `@image-gen/shared` — the zod contract (request/response schemas, model ids, size rules) consumed by both gateway and app. |
| `docs/research/` | Dated research findings. Treat as snapshots — re-verify time-sensitive claims (API bugs, versions) before relying on them. |

## Local dev

- Root `bun run dev` runs both halves concurrently via `bun run --filter '*' dev:stack` (no `concurrently` dep): gateway on **:7716** (`bunx kill-port` first, secrets via `secrets-run` + `.env.local.tpl`) and `tauri dev` (Vite on :1420 is Tauri-internal). The Tauri half needs Rust — MacBook only, not the headless mini.
- `image-gen.test` → localhost:7716 is registered in the dotfiles Caddyfile (port registry).
- The app's `dev` script must stay plain `vite` — Tauri's `beforeDevCommand` invokes it; the concurrent pair uses `dev:stack`.
- **Logs:** app → `~/Library/Logs/com.jkrumm.image-gen/imagegen.log` (`tauri-plugin-log`, stdout + LogDir targets); gateway → single-line JSON on stdout (`docker logs` on the VPS).
- **Capability edits need a forced rebuild:** cargo's `rerun-if-changed` misses content edits to `src-tauri/capabilities/*.json` — `touch src-tauri/build.rs` before `cargo build`/`tauri dev`, then verify the generated `target/debug/build/image-gen-*/out/capabilities.json` (newest by mtime) contains the change.
- `http:default` scope patterns are URLPattern constructor strings — an omitted port means *default port only*, so wildcards must be `http://*:*`, never `http://**`.

## Conventions

- **Public repo.** Never commit secrets, internal hostnames, or endpoint URLs — the upstream LLM endpoint base URL and API key resolve from 1Password (`op://common/anthropic/OPENAI_BASE_URL`, `op://common/anthropic/API_KEY`) via `.env.tpl` templates. Placeholders only in docs.
- Direct-to-master, no ticket prefixes, conventional commits.
- Bun everywhere (`bun install --frozen-lockfile`); TypeScript strict; pin direct deps exact.
- Gateway follows the established personal-gateway pattern (typed contract, OpenAPI, bearer auth, Makefile-driven Docker deploy) — mirror `research-gateway`/`audio-gateway` structure where sensible, and reuse the `generateImage()` patterns from `sideclaw/server/lib/iu-openai.ts` (retry set, 410 fail-fast, PNG magic-byte check, usage sink).
- basalt-ui changes stay in the basalt-ui repo with their own separate commits — never vendored or committed from here.

## Probe the endpoint — do not trust docs about it

**The single most valuable habit in this repo.** In one session, live probes disproved **five** claims that vendor docs, blogs, and a fresh deep-research report all asserted (edits being broken, edits being presets-only, `n=1` on older models, `input_fidelity` being ignored rather than a hard 400, and SSE event names being uniform). Three would have shipped code that typechecked and then failed at runtime. Research is a *starting hypothesis*; the endpoint is the truth.

A probe costs ~$0.006 (`quality: "low"`) and ~20 seconds. That is always cheaper than an agent guessing wrong.

```bash
cd gateway && secrets-run run --env-file=.env.local.tpl -- bun /path/to/scratch/probe.ts
```

- `secrets-run` is a drop-in `op` shim — **required on the headless mini**, where plain `op`/`op run` hangs on the biometric prompt forever.
- Read `OPENAI_BASE_URL`/`OPENAI_API_KEY` from `process.env`; append paths (`/images/generations`) exactly like `upstream.ts` — never hardcode `/openai/v1`.
- Put throwaway probes in a scratch dir, **never in the repo**.
- Elide `b64_json` when printing or you will flood the terminal with megabytes of base64.
- Remember the 503-wrapping (below): a "503" in a probe is usually a **400 telling you exactly what you got wrong** — read the body.

**When a brief hands you a "verified fact", trust it. When it hands you a generalization ("X is per-model, so it must hold for Y"), probe Y.** That exact generalization is what produced this session's one real bug: SSE event names turned out to be per-*endpoint* (`image_edit.*`), and matching only `image_generation.*` silently broke every streamed edit.

## Load-bearing API facts (live-probed against our own endpoint 2026-07-16 — see docs/research/endpoint-verification.md)

These come from probing the upstream we actually call, not from vendor docs — public write-ups get several of them wrong. Re-probe before trusting any contradicting source.

- **Capabilities are per-model, not per-endpoint.** Each fact below holds identically on `/images/generations` and `/images/edits`. `MODEL_CAPABILITIES` in `shared/src/contract.ts` is the single source of truth.
- gpt-image-2 does **not** support transparent backgrounds (400, both endpoints) → transparency requests route to `gpt-image-1.5`, which does. This is permanent; the fallback is load-bearing, not legacy.
- gpt-image-2 rejects **`input_fidelity`** outright ("does not support the parameter") — it is locked to high internally. `gpt-image-1.5` accepts it. Never forward it for gpt-image-2. It is an *edits-only* parameter; `/images/generations` rejects it as unknown for every model.
- **Only gpt-image-2 accepts arbitrary `WxH`** (multiples of 16, ratio ≤ 3:1, 655,360–8,294,400 px, max edge < 3840) — on **both** endpoints, including 2560×1440. `gpt-image-1.5`/`-mini` are presets-only on both.
- `/v1/images/edits` **works** with gpt-image-2 (multipart, `image[]` for multiple refs). The old openai-node#1844 400 bug is fixed — the Responses API detour is no longer needed (it is proxied and works, but only earns its keep for multi-turn).
- Streaming passes through on **both** endpoints, and is **n=1 only** ("Streaming is only supported with n=1"). **SSE event names are the one per-endpoint exception**: `/images/generations` emits `image_generation.partial_image`/`.completed`, `/images/edits` emits **`image_edit.*`** — identical payloads, different namespace. Match on the suffix. The final image *and* `usage` arrive inside the `completed` frame; upstream may send fewer partials than requested.
- `n` up to 10 works on **all three** models (write-ups claiming 1.5/mini are limited to n=1 are wrong here).
- GPT Image models always return `b64_json`; usage tokens are in every response (surface cost per generation).
- The upstream vendor proxy wraps 400-class validation errors in an **HTTP 503** with `"type": "..._user_error"` — these must never be retried. `upstream.ts` already keys off `user_error`.

### Cost shape (measured 2026-07-16, gpt-image-2 @ 1024×1024)

Drives the UX defaults — don't re-litigate these from intuition:

| | output tokens | ~USD | note |
|-|-|-|-|
| `quality: low` | 196 | $0.006 | drafting tier |
| `quality: high` | 7,024 | $0.211 | **35.8× low** — why quality stays adjustable |
| streaming overhead | **+77 flat** | +$0.002 | +39% on low, **+1% on high** — why previews default ON |

Streaming overhead is flat per request, not per partial: asking for 3 partials delivered **1** (upstream skips them when generation is fast). Never build UI that waits for a fixed partial count.

## Validation surface (know what "green" actually proves)

- **`bun run pre`** = `format:check && lint && typecheck` — run it before proposing a commit. Plus `cd gateway && bun test` (63 tests).
- **oxlint + oxfmt**, matching the basalt-ui/argo ecosystem (never Biome/ESLint/Prettier). Root `.oxlintrc.json` **extends the shipped basalt preset** (`./node_modules/basalt-ui/configs/oxlint.json` — oxlint rejects bare specifiers, so the relative path is required), which brings the `basalt/*` design-guard rules. Style is basalt's: single quotes, no semicolons, printWidth 100.
- `basalt-ui` is a root devDependency **purely so lint can resolve that preset** — bun doesn't hoist `app/`'s copy to root. Same trick argo uses. It's a `file:` link that is **copied**, not symlinked: after editing basalt-ui, `rm -rf node_modules/.bun/basalt-ui@file* node_modules/basalt-ui && bun install` or consumers keep seeing the old copy.
- **There is still no app-side test suite** — `gateway/` has `bun test`, `app/` has nothing. Lint + typecheck say the types and idioms line up; they say *nothing* about runtime behavior.
- Consequently: anything touching the Tauri runtime (fs capabilities, plugin-http, canvas pointer math) is **unverified until someone runs the app**. Say so plainly in reports rather than implying green typecheck means working.
- Root `bun run typecheck` covers all workspaces — but **don't run it while another agent is mid-flight in a package you don't own**; you'll see their in-flight errors and "fix" phantoms. Scope it: `cd app && bunx tsc --noEmit -p tsconfig.app.json`.
- Driving the real app needs Rust + a GUI → **MacBook only**. The headless mini has cargo (so `cargo build` and capability regen work) but cannot run `tauri dev`.

## Framework gotchas (each cost real debugging — verified in `node_modules`, not from memory)

- **Elysia response validation is skipped for generator returns.** The compiled gate is `if (res instanceof Response === false && typeof res?.next !== 'function' && !(res instanceof ReadableStream))`. It checks the **returned value**, not the handler's declaration — so a plain `async` handler that *returns* an async-generator still streams, while returning a plain object still gets validated. Keep handlers plain `async` and return the generator only for streaming; making the handler itself `async function*` silently disables validation on the JSON path too. Pinned by `gateway/src/lib/elysia-generator-validation.test.ts`.
- **Elysia returns `422`, not `400`, for request-schema violations.** Hand-rolled `400`s in the routes are *business-rule* checks (size/fidelity/mime) that zod can't express — don't add dead `400` slots for things the schema already covers.
- **Elysia multipart needs no `body` schema** — `type: "multipart/form-data"` in route options is OpenAPI metadata only; parsing is triggered by content-type sniffing when the handler destructures `body`.
- **Two different `capabilities.json` files.** `src-tauri/gen/schemas/capabilities.json` is the *schema of every possible permission* — grepping it proves nothing. The **granted** set is `src-tauri/target/debug/build/image-gen-*/out/capabilities.json` (newest by mtime). Verify there.
- **zod v4 keeps `.shape` through `.superRefine()`** — object schemas with refinements still expose `.shape.field`, so `metadata.ts`'s "reuse the contract's field schemas" pattern survives.
