# Handover — state as of 2026-07-16

Written at the end of the session that built Phase 2 + 3. Delete or rewrite this file once its "next steps" are done; it is a snapshot, not a permanent doc.

## Read this first

`CLAUDE.md` → **"Probe the endpoint — do not trust docs about it"**, then **"Load-bearing API facts"**, then **"Framework gotchas"**. Those three sections encode everything this session learned the hard way. `docs/research/endpoint-verification.md` is ground truth; `docs/research/image-api.md` is a **stale secondary source** with a warning banner.

## What shipped this session

Everything below typechecks; `gateway/` has 63 passing tests.

| Area | State |
|-|-|
| `shared/` | Contract rewritten: `MODEL_CAPABILITIES`, edit + stream + enhance schemas, `EDIT_LIMITS`. `rules.ts` = single source of truth for `resolveModel`/`validateSizeForModel`/`validateInputFidelityForModel`. |
| Gateway `/edit` | Multipart → `/images/edits` (up to 16 refs via `image[]`, optional alpha mask). |
| Gateway streaming | SSE on `/generate` + `/edit`, `partial_images` 0–3, n=1 only. |
| Gateway `/enhance` | Brief → refined prompt via `gpt-5.6` (`ENHANCE_MODEL`). Never auto-applied — the user reviews it. |
| App | Edit view (drag-drop refs, mask canvas), presets, streaming previews, transparency-trap fix, "iterate on this image" from Library. |
| Telemetry | `reportUsage` → argo, **ON by default both locally and in prod** — a local generation spends real IU tokens, so opt-in local telemetry would silently under-report spend. Prod posts over the internal `monitoring-net` docker route to `argo-api`; local uses the public host. `MACHINE` (default `vps`, `local` in `.env.local.tpl`) keeps the two distinguishable. **Verified end-to-end**: a real local generate produced `{"source":"image-gen-gateway","count":1}` in `GET /usage/summary`. |

## Tooling note

oxlint + oxfmt are wired (`bun run pre` = format:check + lint + typecheck), extending basalt-ui's shipped preset. This required a **one-line fix in basalt-ui** — its preset documented itself with a `"//"` object key, which oxlint rejects (`deny_unknown_fields`), breaking `extends` for every consumer. It was never caught because basalt-ui hand-copies its own ruleset instead of extending its preset. **That fix is uncommitted in `~/SourceRoot/basalt-ui` (on `feat/s0-mantine-pivot`, alongside unrelated in-flight work) and still needs its own separate commit + PR.** Consider making basalt-ui's own `.oxlintrc.json` extend the preset so it's finally dogfooded.

## ⚠️ Nothing here has been run in the real app

**This is the most important line in this document.** Lint + typecheck are green, but there are **no app-side tests** and nothing has been executed. Everything below is implemented-and-checked but **never run**:

- **Mask coordinate mapping** (`MaskCanvas.pointFromEvent` in `Edit.tsx`) — scale factors are logically right but pixel alignment is unconfirmed. Wrong mapping = silently misaligned edits.
- **Abort-signal race** in `app/src/lib/gateway.ts` `readChunk` — races `read()` against the signal rather than relying on `reader.cancel()` semantics.
- **Disk → `File` loading** in `Library.tsx` ("use as edit reference"). Needed `fs:allow-read-file`, which was missing and is now added + rebuild-verified — but the call path itself is untested.

### Next step (a human must do this)

On the **MacBook** (the mini has cargo but no GUI — `tauri dev` can't run there):

```bash
bun run dev
```
Then drive: (1) a plain generate, (2) a streamed generate (partials > 0), (3) an edit with 2 reference images, (4) a masked inpaint, (5) "use as edit reference" from the Library, (6) `/enhance`.

Nothing is committed yet. **Don't commit until the app has actually been driven.**

## Open decisions (not bugs — they need a human call)

1. **Transparency strategy** — see `docs/research/transparency-and-vector.md`. Today: `transparent` → `gpt-image-1.5` native alpha (works, probe-verified). Proposed alternative: gpt-image-2 + local matting (Apple Vision is the permissive, dep-free pick; RMBG-2.0 is non-commercial and @imgly is AGPL — **both disqualified for a public repo**). **Measure `1.5 native` vs `gpt-image-2 + matting` on one icon before building anything.**
2. **SVG** — no model emits it natively. VTracer (MIT, cutout mode, precision 3) or LLM-drawn SVG via the already-wired text model. PRD lists this as post-MVP fast-follow.
3. **Configurable presets** — `PRESETS` in `app/src/lib/presets.ts` is a hardcoded array. Making them user-editable (stored on disk beside the library, like `~/Pictures/ImageGen/presets.json`) is a reasonable ask; nobody has designed it.
4. **UX defaults settled by measurement** (see CLAUDE.md → "Cost shape"): streaming should default **ON** (+1% at high quality). Quality stays **adjustable** — high is **35.8×** low, so drafting cheap is the point. Custom size stays — gpt-image-2 is the *only* model that supports it, and it's what makes 2560×1440 covers possible.

## Fresh-agent prompt

```
Read CLAUDE.md (esp. "Probe the endpoint", "Load-bearing API facts", "Framework
gotchas", "Validation surface") and docs/handover.md before touching anything.

Key context:
- Live probes beat docs here — 5 documented claims about this API were false.
  A probe costs ~$0.006 and 20s:
  cd gateway && secrets-run run --env-file=.env.local.tpl -- bun <scratch>/probe.ts
  (plain `op` HANGS on the headless mini; scratch files never go in the repo.)
- shared/src/rules.ts is the single source of truth for model/size/fidelity rules.
  Never re-derive them in a view or a route — that triplication was just removed.
- Validate with `bun run pre` (format:check + lint + typecheck; oxlint/oxfmt
  extending basalt-ui's preset) and `cd gateway && bun test` (63 pass). There are
  NO app-side tests and nothing has been run in the real app — GREEN ≠ WORKING.
  Say so in reports rather than implying otherwise.
- Don't run root `bun run typecheck` while another agent owns a package you don't.

My task: <task>
```

## If you fan out agents again

What worked: assign **disjoint file ownership** up front and state it strictly; bake probed facts into the brief (a subagent can't see your research); tell agents to **report contradictions rather than work around them** — that's how the `image_edit.*` bug and the `fs:allow-read-file` blocker surfaced.

What to watch: agents commenting on files another agent is concurrently rewriting produce **stale claims** (one reported Compose lacked controls that had just been added) — verify before acting. And agents independently re-implement shared rules unless the brief points at an existing home for them; that produced three copies of one rule in a single session.
