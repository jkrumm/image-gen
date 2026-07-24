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

- **`make up` is the entrypoint** — it brings both halves to your working tree (build+install the Mac app, deploy the gateway) and then *proves* each: the app by source fingerprint, the gateway by comparing the running image's git-SHA tag against `HEAD`. Both checks exist because "it's healthy" and "it's running your code" are different claims, and only the second one is worth anything after an edit.
- **`make configure`** seeds `~/Pictures/ImageGen/.imagegen/settings.json` from 1Password so the app never prompts for either service's token. Settings v2 nests two independent connections — `{ gateway: { baseUrl, token }, imageShare?: { baseUrl, token } }` — gateway from `op://vps/image-gen-gateway/{BASE_URL,API_SECRET}` (required; the target fails loudly if these are unreadable) and image-share from `op://homelab/image-share/{BASE_URL,API_SECRET}` (optional; unreadable refs degrade to a warning and a gateway-only file, never a hang or a failed target — image-share only gates the Library's Share/Publish actions). `app/src/lib/settings.ts`'s `migrateSettingsShape()` upgrades a v1 flat `{ baseUrl, token }` file in place at read time (never rewrites it on disk, same lazy-upgrade pattern as the sidecar's schema migration). This is needed because **WebKit partitions localStorage per executable**: `tauri dev` stores under `~/Library/WebKit/image-gen`, the bundled app under `~/Library/WebKit/com.jkrumm.image-gen`. Settings entered in one are invisible to the other. The file is the store of record; localStorage is a cache hydrated from it on boot.
- **Never let a Makefile target call `op` without a timeout.** On this machine `op` blocks forever on a biometric prompt nobody is present to approve, which turns "read a secret" into a hang rather than an error. The `op_read` helper at the top of the Makefile tries `secrets-run` (offline cache, fails fast) and falls back to `timeout 15 op`. A hung target is worse than a failed one: it gives you nothing to act on and burns the whole tool-call budget.
- **`op signin` does not persist into later tool calls** — it exports a session token into *that* shell only. What actually makes `op` work non-interactively is 1Password's desktop-app CLI integration, and even then the session lapses. Treat `secrets-run` + `headless.refs` as the only reliable path; both `op://vps/image-gen-gateway/{API_SECRET,BASE_URL}` are allowlisted there.
- **`op` over ssh reads stdin as JSON.** `ssh vps 'op item create ...'` fails with `invalid JSON in piped input` because ssh hands it a non-tty stdin. Redirect it: `</dev/null`.
- **The VPS 1Password service account is read-only on the `vps` vault** — it can `read` but not `item create`/`item edit`. New gateway secrets must be created from a signed-in human machine or the 1Password GUI.
- **`bun run dev` is not how you use the app.** `make app` builds the release bundle, installs it to `/Applications/ImageGen.app`, and *proves* the installed app was built from the current working tree — it records a `scripts/codesum.ts` fingerprint at `Contents/Resources/.codesum` and re-checks it on every `make app-run` / `make app-status`. A stale `.app` in the dock is indistinguishable from a current one by eye, and the ~70s cargo release build makes "rebuild later" tempting; the assertion is what makes that safe. **The fingerprint is a stronger guarantee than a cacheless rebuild**, which is why it is the default: `--no-cache` proves only that the build was fresh, not that the artifact came from the tree in front of you, and it cannot tell a stale cache apart from a real bug — so pulling it skips a diagnosis rather than completing one (`dotfiles/rules/makefile-conventions.md`: "assert, don't nuke"). `CLEAN=1` exists for deliberately ruling out the toolchain, at ~10 min versus ~70s. `make dev` (the Vite/`tauri dev` pair) is for *writing* code.
- Root `bun run dev` runs both halves concurrently via `bun run --filter '*' dev:stack` (no `concurrently` dep): gateway on **:7716** (`bunx kill-port` first, secrets via `secrets-run` + `.env.local.tpl`) and `tauri dev` (Vite on :1420 is Tauri-internal). The owner's day-to-day machine is a **Mac mini with a GUI + cargo** — `tauri dev` runs there directly, no MacBook required. Secrets backend on the mini is `cache`: always use `secrets-run`, never plain `op` (it hangs forever on the biometric prompt with no human present).
- `image-gen.test` → localhost:7716 is registered in the dotfiles Caddyfile (port registry).
- The app's `dev` script must stay plain `vite` — Tauri's `beforeDevCommand` invokes it; the concurrent pair uses `dev:stack`.
- **Logs:** app → `~/Library/Logs/com.jkrumm.image-gen/imagegen.log` (`tauri-plugin-log`, stdout + LogDir targets); gateway → single-line JSON on stdout (`docker logs` on the VPS).
- **Capability edits need a forced rebuild:** cargo's `rerun-if-changed` misses content edits to `src-tauri/capabilities/*.json` — `touch src-tauri/build.rs` before `cargo build`/`tauri dev`, then verify the generated `target/debug/build/image-gen-*/out/capabilities.json` (newest by mtime) contains the change.
- `http:default` scope patterns are URLPattern constructor strings — an omitted port means *default port only*, so wildcards must be `http://*:*`, never `http://**`.
- **GUI automation is available on this machine.** `cmux.app` holds macOS Accessibility + Screen Recording permissions, so an agent can drive the real running app: `osascript` System Events for input (`click at {x,y}`, `keystroke`) and `screencapture -R x,y,w,h` for verification. Two gotchas: the webview exposes no AXButton tree (`entire contents` returns nothing), so clicking is coordinate-based off a 1:1 screenshot, not accessibility-driven; and the window must be raised (`perform action "AXRaise" of window 1`) before every capture or another app's window gets photographed instead. This turns "unverified until someone runs the app" into something an agent can actually do, not just a caveat to repeat.

## Conventions

- **Public repo.** Never commit secrets, internal hostnames, or endpoint URLs — the upstream LLM endpoint base URL and API key resolve from 1Password (`op://common/anthropic/OPENAI_BASE_URL`, `op://common/anthropic/API_KEY`) via `.env.tpl` templates. Placeholders only in docs.
- Direct-to-master, no ticket prefixes, conventional commits.
- Bun everywhere (`bun install --frozen-lockfile`); TypeScript strict; pin direct deps exact.
- Gateway follows the established personal-gateway pattern (typed contract, OpenAPI, bearer auth, Makefile-driven Docker deploy) — mirror `research-gateway`/`audio-gateway` structure where sensible, and reuse the `generateImage()` patterns from `sideclaw/server/lib/iu-openai.ts` (retry set, 410 fail-fast, PNG magic-byte check, usage sink).
- basalt-ui changes stay in the basalt-ui repo with their own separate commits — never vendored or committed from here.
- **`snapSizeForModel(model, size)` in `shared/src/rules.ts` is the replay chokepoint.** Every path that re-runs a generation (Re-run, Promote, Tweak) routes its size through this function — it's the single place that turns a stored/derived size into a value the target model will actually accept. Changing replay behavior means changing it here, not in each caller.
- **Migrate before parse.** Sidecar `schema: 2` has no default and `migrateGenerationMetadata()` never rewrites the file on disk — so any code path that reads a sidecar and then re-parses or re-validates it must call `migrateGenerationMetadata()` first. Skipping this shipped a real bug once (`derived.ts`); treat it as a hard rule for every new read-then-write sidecar path.

## Probe the endpoint — do not trust docs about it

**The single most valuable habit in this repo.** In one session, live probes disproved **five** claims that vendor docs, blogs, and a fresh deep-research report all asserted (edits being broken, edits being presets-only, `n=1` on older models, `input_fidelity` being ignored rather than a hard 400, and SSE event names being uniform). Three would have shipped code that typechecked and then failed at runtime. Research is a *starting hypothesis*; the endpoint is the truth.

A probe costs ~$0.006 (`quality: "low"`) and ~20 seconds. That is always cheaper than an agent guessing wrong.

```bash
cd gateway && secrets-run run --env-file=.env.local.tpl -- bun /path/to/scratch/probe.ts
```

- `secrets-run` is a drop-in `op` shim — **required on the mini** (secrets backend there is `cache`), where plain `op`/`op run` hangs on the biometric prompt forever with no human present to approve it.
- Read `OPENAI_BASE_URL`/`OPENAI_API_KEY` from `process.env`; append paths (`/images/generations`) exactly like `upstream.ts` — never hardcode `/openai/v1`.
- Put throwaway probes in a scratch dir, **never in the repo**.
- Elide `b64_json` when printing or you will flood the terminal with megabytes of base64.
- Remember the 503-wrapping (below): a "503" in a probe is usually a **400 telling you exactly what you got wrong** — read the body.

**When a brief hands you a "verified fact", trust it. When it hands you a generalization ("X is per-model, so it must hold for Y"), probe Y.** That exact generalization is what produced this session's one real bug: SSE event names turned out to be per-*endpoint* (`image_edit.*`), and matching only `image_generation.*` silently broke every streamed edit.

## Load-bearing API facts (live-probed against our own endpoint 2026-07-16 — see docs/research/endpoint-verification.md)

These come from probing the upstream we actually call, not from vendor docs — public write-ups get several of them wrong. Re-probe before trusting any contradicting source.

### The studio is single-model: gpt-image-2 only

**All new generations run on `gpt-image-2`.** `gpt-image-1.5` and `gpt-image-1-mini` are **retired from the generate path** and permanently supported on the **read path**. Two enums encode exactly this, and the distinction is load-bearing:

| Enum | Path | Contents | May shrink? |
|-|-|-|-|
| `IMAGE_MODELS` | generate | `['gpt-image-2']` | yes |
| `KNOWN_IMAGE_MODELS` | read (sidecar parsing) | all three, type `KnownImageModel` | **never** |

`MODEL_CAPABILITIES` is keyed by `KnownImageModel` and still holds all three — it describes what each model *is*, which is how old sidecars stay interpretable.

> **Retiring a model is never a subtractive enum edit.** `listGenerations()` silently skips sidecars that fail to parse, so removing a model id from the schema makes existing library entries vanish with only a log warning. Split the enums: `KNOWN_IMAGE_MODELS` (read path, never shrink) vs `IMAGE_MODELS` (generate path, safe to shrink).

**Transparency is currently UNAVAILABLE.** gpt-image-2 has no alpha channel (hard 400 on `background: "transparent"`, both endpoints, probe-verified), and it is the only model we generate on — so the studio has no way to emit transparency at all. `TRANSPARENCY_MODEL` and the reroute it powered are **gone**; `validateBackgroundForModel()` now hard-rejects `background: 'transparent'`. This is a deliberate, temporary capability regression. The documented restoration path is **local matting via Apple Vision** (`VNGenerateForegroundInstanceMaskRequest`) on a plain-white-background generation — permissive licence, zero dependencies, macOS-native (`docs/research/transparency-and-vector.md`). **Never** propose chroma-key / "generate on a flat colour and key it out": that same doc records it as a failure (colour leakage, non-uniform solids, 1px halos).

`background: 'transparent'` and `input_fidelity` remain **valid schema values** so historical sidecars still parse. Valid to parse ≠ valid to send.

### Per-model capabilities

- **Capabilities are per-model, not per-endpoint.** Each fact below holds identically on `/images/generations` and `/images/edits`. `MODEL_CAPABILITIES` in `shared/src/contract.ts` is the single source of truth.
- gpt-image-2 accepts **arbitrary `WxH`** (multiples of 16, ratio ≤ 3:1, 655,360–8,294,400 px, max edge < 3840) on **both** endpoints, including 2560×1440 — so custom sizes are always available in the studio. *(Historical: `gpt-image-1.5`/`-mini` are presets-only on both. `snapSizeForModel(model: KnownImageModel, size)` is the replay chokepoint and snaps legacy-model sizes into gpt-image-2's envelope.)*
- gpt-image-2 rejects **`input_fidelity`** outright ("does not support the parameter") — it is locked to high internally, so **never send it**. It is an *edits-only* parameter; `/images/generations` rejects it as unknown for every model. *(Historical: `gpt-image-1.5` accepts it — that's why old sidecars carry it.)*
- *Historical:* gpt-image-1.5 **does** support transparent backgrounds. This is why 6 of the 9 sidecars on disk carry `background: transparent`, and why the read path must keep accepting that value forever.
- `/v1/images/edits` **works** with gpt-image-2 (multipart, `image[]` for multiple refs). The old openai-node#1844 400 bug is fixed — the Responses API detour is no longer needed (it is proxied and works, but only earns its keep for multi-turn).
- Streaming passes through on **both** endpoints, and is **n=1 only** ("Streaming is only supported with n=1"). **SSE event names are the one per-endpoint exception**: `/images/generations` emits `image_generation.partial_image`/`.completed`, `/images/edits` emits **`image_edit.*`** — identical payloads, different namespace. Match on the suffix. The final image *and* `usage` arrive inside the `completed` frame; upstream may send fewer partials than requested.
- `n` up to 10 works on **all three** models (write-ups claiming 1.5/mini are limited to n=1 are wrong here).
- GPT Image models always return `b64_json`; usage tokens are in every response (surface cost per generation).
- The upstream vendor proxy wraps 400-class validation errors in an **HTTP 503** with `"type": "..._user_error"` — these must never be retried. `upstream.ts` already keys off `user_error`.
- **The painted-checkerboard failure mode (live bug, both models).** If the prompt text asks for "isolated on a transparent background" but the request actually sends `background: "opaque"`, the model doesn't error — it **paints a fake transparency checkerboard into the opaque pixels**. Verified on both gpt-image-2 and gpt-image-1.5: output had `hasAlpha: no`, PNG colortype 2 (RGB), with a visible checkerboard baked in. Prompt text and the `background` parameter can silently disagree and produce garbage that *looks* transparent at a glance. This also means any future background-removal/matting step would inherit painted checkerboard pixels rather than real alpha — always check `hasAlpha`/colortype on output rather than trusting the image visually. **Now that every request is `opaque`, the playbook rule "never write 'transparent background' into prompt text" is a flat prohibition and is load-bearing, not cosmetic** — there is no longer any request shape in which those words are correct.

### Cost shape (measured 2026-07-16, gpt-image-2 @ 1024×1024)

Drives the UX defaults — don't re-litigate these from intuition. **These anchors are gpt-image-2-specific, not universal** — cost scales per model, not just per quality/size. Measured on gpt-image-1.5 at `low`/1024²: ~429 output tokens/image, ~2.2× the gpt-image-2 anchor below — applying the gpt-image-2 numbers to gpt-image-1.5 under-quotes by ~2.2×. (`shared/src/cost.ts` owns the anchor constants; treat any single cross-model anchor there as a bug.)

| | output tokens | ~USD | note |
|-|-|-|-|
| `quality: low` | 196 | $0.006 | drafting tier |
| `quality: high` | 7,024 | $0.211 | **35.8× low** — why quality stays adjustable |
| streaming overhead | **+77 flat** | +$0.002 | +39% on low, **+1% on high** — why previews default ON |

Streaming overhead is flat per request, not per partial: asking for 3 partials delivered **1** (upstream skips them when generation is fast). Never build UI that waits for a fixed partial count.

**Measured cross-model comparison** (same prompt, `low`, `n=4`, 1024×1024): gpt-image-2 opaque = **$0.02625**; gpt-image-1.5 transparent = **$0.057764**. gpt-image-2 is ~2.2× cheaper for the equivalent job — a real factor in the opaque-vs-transparent routing decision, not just a token-count curiosity.

## Validation surface (know what "green" actually proves)

- **`bun run pre`** = `format:check && lint && typecheck` — run it before proposing a commit. Plus `cd gateway && bun test` (63 tests).
- **oxlint + oxfmt**, matching the basalt-ui/argo ecosystem (never Biome/ESLint/Prettier). Root `.oxlintrc.json` **extends the shipped basalt preset** (`./node_modules/basalt-ui/configs/oxlint.json` — oxlint rejects bare specifiers, so the relative path is required), which brings the `basalt/*` design-guard rules. Style is basalt's: single quotes, no semicolons, printWidth 100.
- `basalt-ui` is a root devDependency **purely so lint can resolve that preset** — bun doesn't hoist `app/`'s copy to root. Same trick argo uses. It's a `file:` link that is **copied**, not symlinked: after editing basalt-ui, `rm -rf node_modules/.bun/basalt-ui@file* node_modules/basalt-ui && bun install` or consumers keep seeing the old copy.
- **App-side unit tests exist and are substantial** — 315 tests total (42 shared / 108 gateway / **165 app**). What's still missing is a *component/integration* harness: pure logic (lib functions, stores, replay/lineage/roles) is well covered; anything touching the actual Tauri runtime (fs capabilities, `plugin-http`, canvas pointer math, the webview) is not exercised by any test. Say that precisely — don't claim "no app-side tests" (wrong) or imply green tests cover runtime behavior (also wrong).
- Consequently: anything touching the Tauri runtime is **unverified until someone runs the app**, either manually or via the `osascript`/`screencapture` GUI-automation path above. Say so plainly in reports rather than implying green typecheck+tests means working — a dot-glob fs-scope bug (below) shipped invisible to all 315 tests and was fatal at first boot.
- Root `bun run typecheck` covers all workspaces — but **don't run it while another agent is mid-flight in a package you don't own**; you'll see their in-flight errors and "fix" phantoms. Scope it: `cd app && bunx tsc --noEmit -p tsconfig.app.json`.
- Driving the real app needs Rust + a GUI. The owner's Mac mini has both — `tauri dev` runs there directly.

## Framework gotchas (each cost real debugging — verified in `node_modules`, not from memory)

- **Elysia response validation is skipped for generator returns.** The compiled gate is `if (res instanceof Response === false && typeof res?.next !== 'function' && !(res instanceof ReadableStream))`. It checks the **returned value**, not the handler's declaration — so a plain `async` handler that *returns* an async-generator still streams, while returning a plain object still gets validated. Keep handlers plain `async` and return the generator only for streaming; making the handler itself `async function*` silently disables validation on the JSON path too. Pinned by `gateway/src/lib/elysia-generator-validation.test.ts`.
- **Elysia returns `422`, not `400`, for request-schema violations.** Hand-rolled `400`s in the routes are *business-rule* checks (size/fidelity/mime) that zod can't express — don't add dead `400` slots for things the schema already covers.
- **Elysia multipart needs no `body` schema** — `type: "multipart/form-data"` in route options is OpenAPI metadata only; parsing is triggered by content-type sniffing when the handler destructures `body`.
- **Two different `capabilities.json` files.** `src-tauri/gen/schemas/capabilities.json` is the *schema of every possible permission* — grepping it proves nothing. The **granted** set is `src-tauri/target/debug/build/image-gen-*/out/capabilities.json` (newest by mtime). Verify there.
- **zod v4 keeps `.shape` through `.superRefine()`** — object schemas with refinements still expose `.shape.field`, so `metadata.ts`'s "reuse the contract's field schemas" pattern survives.
- **`tauri-plugin-fs` defaults to `require_literal_leading_dot: true` on unix** — verified in `tauri-plugin-fs-2.5.1/src/commands.rs:1559` (`.unwrap_or(cfg!(unix))`). Consequence: a glob like `$PICTURE/ImageGen/**` **cannot match** anything under `.imagegen/...` — glob's leading-dot exclusion applies even mid-path. Every dot-prefixed directory needs its own explicit scope entries — both `$PICTURE/ImageGen/.imagegen` *and* `$PICTURE/ImageGen/.imagegen/**` — on every fs permission that touches it. This shipped broken once: the whole `.imagegen/` state dir (drafts, projects, styles) threw `forbidden path` on first boot, making draft persistence structurally impossible until `app/src-tauri/capabilities/default.json` was fixed.
