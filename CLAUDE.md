# image-gen

Personal image-generation studio: a stateless VPS gateway (`gateway/`) wrapping the gpt-image model family + a Tauri v2 macOS app (`app/`) that owns all state on local disk.

**Start here:** `README.md` (current state, MacBook install) → `PRD.md` (scope, waves, success criteria) → `docs/concept.md` (the studio's mental model and IA) → `docs/research/endpoint-verification.md` (ground truth about the upstream). **The studio app runs on the MacBook** (its UI machine); agents on the mini reach the gateway through `imgcli gen` (dotfiles `/img` skill) and never need the app.

## Repo layout

| Path | What |
|-|-|
| `gateway/` | Elysia + Bun HTTP service. Stateless — no DB, no image storage. Docker on the VPS, Tailscale-only, bearer auth. |
| `app/` | Tauri v2 macOS app. React + Mantine v9 + basalt-ui (basalt-ui is Mantine-based as of its 2026-07 zinc redesign — **no Tailwind**; wire via `BasaltProvider` + layered CSS imports, reference: argo dashboard). Owns the library at `~/Pictures/ImageGen/`. |
| `shared/` | `@image-gen/shared` — the zod contract (request/response schemas, model ids, size rules) consumed by both gateway and app. |
| `docs/research/` | Dated research findings. Treat as snapshots — re-verify time-sensitive claims (API bugs, versions) before relying on them. `endpoint-verification.md` is the live-probed record; the rest is background. |

## Local dev

- **`make up` is the entrypoint** — it brings both halves to your working tree (build+install the Mac app, deploy the gateway) and then *proves* each: the app by source fingerprint, the gateway by comparing the running image's git-SHA tag against `HEAD`. Both checks exist because "it's healthy" and "it's running your code" are different claims, and only the second one is worth anything after an edit.
- **`make configure`** seeds `~/Pictures/ImageGen/.imagegen/settings.json` from 1Password so the app never prompts for either service's token. Settings v2 nests two independent connections — `{ gateway: { baseUrl, token }, imageShare?: { baseUrl, token } }` — gateway from `op://vps/image-gen-gateway/{BASE_URL,API_SECRET}` (required; the target fails loudly if these are unreadable) and image-share from `op://homelab/image-share/{BASE_URL,API_SECRET}` (optional; unreadable refs degrade to a warning and a gateway-only file, never a hang or a failed target — image-share only gates the Library's Share/Publish actions). `app/src/lib/settings.ts`'s `migrateSettingsShape()` upgrades a v1 flat `{ baseUrl, token }` file in place at read time (never rewrites it on disk, same lazy-upgrade pattern as the sidecar's schema migration). This is needed because **WebKit partitions localStorage per executable**: `tauri dev` stores under `~/Library/WebKit/image-gen`, the bundled app under `~/Library/WebKit/com.jkrumm.image-gen`. Settings entered in one are invisible to the other. The file is the store of record; localStorage is a cache hydrated from it on boot.
- **Never let a Makefile target call `op` without a timeout.** On this machine `op` blocks forever on a biometric prompt nobody is present to approve, which turns "read a secret" into a hang rather than an error. The `op_read` helper at the top of the Makefile tries `secrets-run` (offline cache, fails fast) and falls back to `timeout 15 op`. A hung target is worse than a failed one: it gives you nothing to act on and burns the whole tool-call budget.
- **`op signin` does not persist into later tool calls** — it exports a session token into *that* shell only. What actually makes `op` work non-interactively is 1Password's desktop-app CLI integration, and even then the session lapses. Treat `secrets-run` + `headless.refs` as the only reliable path; both `op://vps/image-gen-gateway/{API_SECRET,BASE_URL}` are allowlisted there.
- **`op` over ssh reads stdin as JSON.** `ssh vps 'op item create ...'` fails with `invalid JSON in piped input` because ssh hands it a non-tty stdin. Redirect it: `</dev/null`.
- **The VPS 1Password service account is read-only on the `vps` vault** — it can `read` but not `item create`/`item edit`. New gateway secrets must be created from a signed-in human machine or the 1Password GUI.
- **`bun run dev` is not how you use the app.** `make app` builds the release bundle, installs it to `/Applications/ImageGen.app`, and *proves* the installed app was built from the current working tree — it records a `scripts/codesum.ts` fingerprint at `Contents/Resources/.codesum` and re-checks it on every `make app-run` / `make app-status`. A stale `.app` in the dock is indistinguishable from a current one by eye, and the ~70s cargo release build makes "rebuild later" tempting; the assertion is what makes that safe. **The fingerprint is a stronger guarantee than a cacheless rebuild**, which is why it is the default: `--no-cache` proves only that the build was fresh, not that the artifact came from the tree in front of you, and it cannot tell a stale cache apart from a real bug — so pulling it skips a diagnosis rather than completing one (`dotfiles/rules/makefile-conventions.md`: "assert, don't nuke"). `CLEAN=1` exists for deliberately ruling out the toolchain, at ~10 min versus ~70s. `make dev` (the Vite/`tauri dev` pair) is for *writing* code.
- Root `bun run dev` runs both halves concurrently via `bun run --filter '*' dev:stack` (no `concurrently` dep): gateway on **:7716** (`bunx kill-port` first, secrets via `secrets-run` + `.env.local.tpl`) and `tauri dev` (Vite on :1420 is Tauri-internal). **The app half lives on the MacBook** — `make app`, `make app-run` and `tauri dev` run there (Xcode CLT + Rust ≥ 1.85 + bun; README → *MacBook install*). The Mac mini runs the gateway half only: probes, `bun test`, `make gateway-*`, and `imgcli gen`. Secrets backend on the mini is `cache`: always use `secrets-run`, never plain `op` (it hangs forever on the biometric prompt with no human present).
- `image-gen.test` → localhost:7716 is registered in the dotfiles Caddyfile (port registry).
- The app's `dev` script must stay plain `vite` — Tauri's `beforeDevCommand` invokes it; the concurrent pair uses `dev:stack`.
- **Logs:** app → `~/Library/Logs/com.jkrumm.image-gen/imagegen.log` (`tauri-plugin-log`, stdout + LogDir targets); gateway → single-line JSON on stdout (`docker logs` on the VPS).
- **Capability edits need a forced rebuild:** cargo's `rerun-if-changed` misses content edits to `src-tauri/capabilities/*.json` — `touch src-tauri/build.rs` before `cargo build`/`tauri dev`, then verify the generated `target/debug/build/image-gen-*/out/capabilities.json` (newest by mtime) contains the change.
- `http:default` scope patterns are URLPattern constructor strings — an omitted port means *default port only*, so wildcards must be `http://*:*`, never `http://**`.
- **No GUI automation for the app.** It once existed on the mini through cmux's Accessibility + Screen Recording grants; cmux was deleted 2026-09-04 and the app moved to the MacBook, where no agent runs. Anything touching the Tauri runtime is verified by a human driving `make app-run` there — say so in reports instead of implying green tests cover it. (If it ever comes back: the webview exposes no AXButton tree, so clicks are coordinate-based off a 1:1 screenshot, and the window must be `AXRaise`d before every capture.)

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

**Transparency is UNAVAILABLE — an open gap, not scheduled** (this line is the one place that status lives; `PRD.md` and `docs/research/transparency-and-vector.md` point here). gpt-image-2 has no alpha channel (hard 400 on `background: "transparent"`, both endpoints, probe-verified), and it is the only model we generate on — so the studio has no way to emit transparency at all. `TRANSPARENCY_MODEL` and the reroute it powered are **gone**; `validateBackgroundForModel()` hard-rejects `background: 'transparent'`. The documented restoration path, when someone picks it up, is **local matting via Apple Vision** (`VNGenerateForegroundInstanceMaskRequest`) on a plain-white-background generation — permissive licence, zero dependencies, macOS-native (`docs/research/transparency-and-vector.md`). **Never** propose chroma-key / "generate on a flat colour and key it out": that same doc records it as a failure (colour leakage, non-uniform solids, 1px halos).

### Gotchas that cost real debugging (full probe tables, cost numbers, per-model matrix: `docs/research/endpoint-verification.md`)

- **Capabilities are per-model, not per-endpoint** (`MODEL_CAPABILITIES` in `shared/src/contract.ts` is the single source of truth) — with one exception: **SSE event names are per-endpoint**: `/images/generations` emits `image_generation.*`, `/images/edits` emits `image_edit.*` — identical payloads, different namespace. Matching only `image_generation.*` silently breaks every streamed edit.
- gpt-image-2 rejects **`input_fidelity`** outright (locked to high internally) — never send it. `background: 'transparent'` and `input_fidelity` remain valid **schema** values so historical sidecars still parse; valid to parse ≠ valid to send.
- Streaming is **n=1 only**; overhead is flat per request (+77 output tokens, ~+$0.002), not per partial — upstream may send fewer partials than requested, never block on a fixed count.
- The upstream vendor proxy wraps 400-class validation errors in an **HTTP 503** with `"type": "..._user_error"` — never retry these; `upstream.ts` already keys off `user_error`.
- **The painted-checkerboard failure mode** (live bug, both models): if the prompt text asks for "transparent background" but the request sends `background: "opaque"`, the model doesn't error — it paints a fake checkerboard into the opaque pixels. Always check `hasAlpha`/PNG colortype on output, never trust the image visually. Since every request is now `opaque`, the playbook rule "never write 'transparent background' into prompt text" is a flat prohibition.
- Cost: low ≈ $0.006/image, high ≈ $0.211 (**35.8× low** — why quality stays adjustable and previews default on). Numbers are gpt-image-2-specific — do not reuse them for gpt-image-1.5 (~2.2× more expensive at the same tier).

## Validation surface (know what "green" actually proves)

- **`bun run pre`** = `format:check && lint && typecheck` — run it before proposing a commit. Plus `bun test` (402 tests). `bunx basalt-ui check-theme` is the palette guard on top (`.github/workflows/check.yml` runs both); it reads `basalt.roots` from the root `package.json`, which points at `app/src`; since 1.20 `bunx basalt-ui doctor` hard-fails when that resolves to zero files, so the two can no longer disagree. Every `theme-allow` must name its rule id — `theme-allow <rule-id> — <reason>`; a bare one warns (`theme-allow-unscoped`) and a first word naming no rule waives nothing. A comment-ONLY line directly above the finding is honoured, so a JSX child no longer has to be hoisted to a const to be annotatable.
- **oxlint + oxfmt**, matching the basalt-ui/argo ecosystem (never Biome/ESLint/Prettier). Root `.oxlintrc.json` **extends the shipped basalt preset** (`./node_modules/basalt-ui/configs/oxlint.json` — oxlint rejects bare specifiers, so the relative path is required), which brings the `basalt/*` design-guard rules. Style is basalt's: single quotes, no semicolons, printWidth 100.
- `basalt-ui` is **pinned to the published npm version** in both `package.json` (root, purely so lint can resolve that preset — bun doesn't hoist `app/`'s copy to root; same trick argo uses) and `app/package.json`. Keep the two in lockstep — never a `file:` link (`docs/concept.md` §9 has the incident). Upgrade via `/upgrade-deps`, then `bunx basalt-ui sync` + `bunx basalt-ui check-theme`.
- **App-side unit tests exist and are substantial** — 402 tests total (68 shared / 108 gateway / **226 app**). What's still missing is a *component/integration* harness: pure logic (lib functions, stores, replay/lineage/roles) is well covered; anything touching the actual Tauri runtime (fs capabilities, `plugin-http`, canvas pointer math, the webview) is not exercised by any test. Say that precisely — don't claim "no app-side tests" (wrong) or imply green tests cover runtime behavior (also wrong).
- Consequently: anything touching the Tauri runtime is **unverified until someone runs the app on the MacBook** (`make app-run`). Say so plainly in reports rather than implying green typecheck+tests means working — a dot-glob fs-scope bug (below) shipped invisible to all of them and was fatal at first boot.
- Root `bun run typecheck` covers all workspaces — but **don't run it while another agent is mid-flight in a package you don't own**; you'll see their in-flight errors and "fix" phantoms. Scope it: `cd app && bunx tsc --noEmit -p tsconfig.app.json`.
- Driving the real app needs Rust + a GUI + a present human: that is the MacBook. The mini validates the gateway half (`bun test`, `make gateway-smoke`, `imgcli gen`).

## Framework gotchas (each cost real debugging — verified in `node_modules`, not from memory)

- **Elysia response validation is skipped for generator returns.** The compiled gate is `if (res instanceof Response === false && typeof res?.next !== 'function' && !(res instanceof ReadableStream))`. It checks the **returned value**, not the handler's declaration — so a plain `async` handler that *returns* an async-generator still streams, while returning a plain object still gets validated. Keep handlers plain `async` and return the generator only for streaming; making the handler itself `async function*` silently disables validation on the JSON path too. Pinned by `gateway/src/lib/elysia-generator-validation.test.ts`.
- **Elysia returns `422`, not `400`, for request-schema violations.** Hand-rolled `400`s in the routes are *business-rule* checks (size/fidelity/mime) that zod can't express — don't add dead `400` slots for things the schema already covers.
- **Elysia multipart needs no `body` schema** — `type: "multipart/form-data"` in route options is OpenAPI metadata only; parsing is triggered by content-type sniffing when the handler destructures `body`.
- **Two different `capabilities.json` files.** `src-tauri/gen/schemas/capabilities.json` is the *schema of every possible permission* — grepping it proves nothing. The **granted** set is `src-tauri/target/debug/build/image-gen-*/out/capabilities.json` (newest by mtime). Verify there.
- **zod v4 keeps `.shape` through `.superRefine()`** — object schemas with refinements still expose `.shape.field`, so `metadata.ts`'s "reuse the contract's field schemas" pattern survives.
- **`tauri-plugin-fs` defaults to `require_literal_leading_dot: true` on unix** — verified in `tauri-plugin-fs-2.5.1/src/commands.rs:1559` (`.unwrap_or(cfg!(unix))`). Consequence: a glob like `$PICTURE/ImageGen/**` **cannot match** anything under `.imagegen/...` — glob's leading-dot exclusion applies even mid-path. Every dot-prefixed directory needs its own explicit scope entries — both `$PICTURE/ImageGen/.imagegen` *and* `$PICTURE/ImageGen/.imagegen/**` — on every fs permission that touches it. This shipped broken once: the whole `.imagegen/` state dir (drafts, projects, styles) threw `forbidden path` on first boot, making draft persistence structurally impossible until `app/src-tauri/capabilities/default.json` was fixed.

<!-- basalt:begin 1.25.0 -->

## basalt-ui (managed — do not hand-edit)

Scaffolded by `bunx basalt-ui init` (the one command that legitimately predates the install) and
refreshed by the locally installed `basalt-ui sync` after every upgrade; `basalt-ui sync --check`
gates drift in CI. This block is framework-owned — edit `DESIGN.md`
or the `basalt-*` rules instead; manual changes here are overwritten on the next sync.

**Stack:** React 19 + Mantine v9, themed by `basalt-ui` (`BasaltProvider` + `createBasaltTheme`).
Colors come from the three-tier `--vx-*` token system — read `VX.*` / a `defineSeries` token,
never a raw hex/`rgb()`/`hsl()`. Charts are visx via `basalt-ui/charts`: every single-plot chart
composes `CartesianChart` (owns margins, scales, axes, grid, cursor, tooltip — draw only marks);
legends/tooltip rows are DERIVED from `series`, never hand-authored (`basalt/hand-rolled-plot` +
`basalt/chart-legend-literal` enforce both); `DualPanel`/`BandStrip`/`MirroredBars` declare
themselves exceptions, and `Donut`/`Heatmap` render no plot-assembly element so the rule never
fires on them. Add a kind on the third repeat, don't loosen the primitives. `basalt-ui/charts` and
`basalt-ui/tokens` are Mantine-free internally (a framework invariant, not something your own app
code must follow) — never import `@visx/*` outside a `charts/` directory (oxlint-enforced).
Toolchain is oxlint + oxfmt (no ESLint/Biome/Prettier) and `basalt-ui check-theme` guards the
palette. Runtime is Bun.

**Before guessing an import, read the installed package's machine docs — `llms.txt` (per-subpath
import map) and `AGENTS.md`, at the install directory.** That is `./node_modules/basalt-ui` only on
a single-package app. In a workspace, basalt resolves under the package that depends on it
(`packages/<name>/node_modules/basalt-ui`), and the repo root may have no copy at all. Run
`basalt-ui doctor` — its `basalt-resolves` line prints the resolved install dir and version; read
the two files there. Invoke the CLI through the **locally installed** bin (the `lint:basalt` script
seeded by `init` shows the path); `bunx basalt-ui` fetches a second copy from npm and can answer
for a different version than the one you are building against.

**DESIGN.md is law.** `./DESIGN.md` (imported below) records this app's palette identity and series
dictionary. Precedence: **DESIGN.md > `basalt-*` rules > skills.** When building or restyling any
UI, that law wins over habit, over library defaults, and over a skill's instinct. The design/charts
workflows are the managed skills in `.claude/skills/` (`/basalt-design`, `/basalt-charts`) — they
defer to DESIGN.md.

@./DESIGN.md

**Restraint override (supersedes `/frontend-design`).** This app is a calm, data-dense,
dark-first professional surface — not a showcase. Ignore `/frontend-design`'s push toward a "BOLD
aesthetic direction", gradient meshes, noise/grain, and dramatic motion. Here: the shipped
three-font system (Nunito Sans body, Hubot Sans condensed headings, JetBrains Mono for every
numeral/micro-label), depth via a whisper shadow + 1px ring (`shadow-card` on panels,
`shadow-raised` on controls — never a decorative drop shadow, never a hover lift), neutral
zinc-by-default with the single saturated accent spent only when earned (trend /
signal / categorical separation). Restraint **is** the identity.

<!-- basalt:end -->
