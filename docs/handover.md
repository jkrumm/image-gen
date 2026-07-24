# Handover — state as of 2026-07-21

Snapshot at the end of the Wave-1 build session, updated after the first real drive of the app. Not a permanent doc — rewrite or delete it once its "next steps" are done.

## Read this first

`CLAUDE.md` → **"Probe the endpoint — do not trust docs about it"**, then **"Load-bearing API facts"**, then **"Framework gotchas"**. Then `docs/concept.md` (canonical spec) and `docs/implementation-plan.md` (group breakdown).

The two corrections that used to be listed here (machine reality, app-side test count) are now folded into `CLAUDE.md` directly — this file no longer needs to carry them.

## What shipped this session

Nothing is committed. Everything below is in the working tree, unstaged.

| Area | What changed |
|-|-|
| **Enhancer calibration** | `shared/playbook/settings.md` restructured: quality/n is now its own decision with an explicit **draft-first default** (`low`/`n:4`), escalating only on explicit signal. Previously the quality rule was folded into the per-intent rows, so every intent match escalated to `high`. `diagram.md` softened. `PLAYBOOK_VERSION` → **2**. |
| **Size replayability** | `snapSizeForModel(model, size)` in `shared/src/rules.ts` — the chokepoint every replay path goes through. Create derives a concrete `WxH` from the first reference image instead of sending `'auto'`. |
| **Data layer (G3)** | Sidecar **schema 2** + read-time migration (`migrateGenerationMetadata`), in-memory `library-index.ts` (search / facets / reverse-lineage), `studio-store.ts` for `.imagegen/` IO. |
| **Plumbing (G4a)** | `plan()` — the `/enhance` v2 client. Streaming wired through the queue (`Job.preview`, `EnqueueOptions`). |
| **Create surface (G4b)** | `Create.tsx` merges Compose + Edit (both deleted). Plan card, references rail, library picker, mask canvas, draft persistence. `App.tsx` → Create / Library / Styles. |
| **Eval tuple** | Sidecar `enhance` record made writable end-to-end: `sidecarEnhanceSchema` now mirrors the response (`additions: {slot,text}[]` + `assumptions: string[]`), the gateway returns `enhance_model`, `library.ts` persists it. |
| **Library (G5)** | `Library.tsx` rewritten: sidebar scopes, search + facet chips, inspector (plan record, lineage panel, roles editor, use-as trio, Refine action). **Tweak / Re-run / Promote now genuinely distinct** — Tweak navigates to Create seeded; Re-run and Promote enqueue directly, no navigation. New pure modules: `replay.ts`, `roles.ts`, `lineage.ts`, `library-filters.ts`. `library.ts` gained `updateGenerationMetadata()`. Seed contract collapsed to one `CreateSeed` with an `op` discriminator. |
| **Real-app fixes** | `app/src-tauri/capabilities/default.json` gained explicit dot-directory scope entries for `.imagegen/` (see bug note below) — without this, draft persistence was structurally broken from first boot. |
| **Single-model retirement** | The studio now generates on **`gpt-image-2` only**. `IMAGE_MODELS` → `['gpt-image-2']` (generate path); new `KNOWN_IMAGE_MODELS` (all three, type `KnownImageModel`) owns the read path. `MODEL_CAPABILITIES` re-keyed to `KnownImageModel`. `TRANSPARENCY_MODEL` and the transparency reroute **deleted**; new `validateBackgroundForModel()` hard-rejects `background: 'transparent'`. `snapSizeForModel(model: KnownImageModel, size)` now snaps legacy-model sizes into gpt-image-2's envelope. `PLAYBOOK_VERSION` → **4** (`settings.md` + `icons.md` re-derived: no transparency, no retired models, no presets-only sizes, never send `input_fidelity`). |

### How each was verified

- **Enhancer calibration** — live-probed the running gateway. Icon brief went from `high`/n=1 (**$0.227**) to `low`/n=4 (**~$0.035**); an explicit "final print-ready" brief still correctly escalates to `high`/n=1.
- **`snapSizeForModel`** — independent property sweep over **108,702** inputs (boundary-hugging, slivers, garbage) across all three models: 0 invariant violations. `1254x1254` → `1248x1248`.
- **Schema-2 migration** — run against the **real** sidecars in `~/Pictures/ImageGen/`, not fixtures: 5/5 migrate and parse, 0 keys lost. Note all 5 **fail** a bare parse, so the migration is load-bearing — a regression makes the library silently vanish (`listGenerations()` skips invalid sidecars, it doesn't throw).
- **`/enhance` contract** — live gateway responses parse against `planResponseSchema` in `full`, `gaps`, and delta modes; `enhance_model: "gpt-5.6"` confirmed on the wire.
- **`ImageBitmap` semantics** — browser-probed: a closed bitmap reports `0×0`. See the bug note below.
- **The real app** — driven directly this session for the first time. Results below.
- **The model retirement** — verified against the **real** library, not fixtures: all **9** sidecars in `~/Pictures/ImageGen/` still parse after the change, **6 of them `gpt-image-1.5`**. This is the whole point of the enum split, and it is the only check that could have caught a subtractive edit (see the lesson below).

### Baseline

**315 tests** passing (42 shared / 108 gateway / 165 app), with `format:check` / `typecheck` / `lint` clean. This is the number to beat — anything below it is a regression.

`bun run lint` exits **0** with ~7 pre-existing warnings (`refine.worker.ts`, `useRefinePreview.ts`, `ExportPanel.tsx`, `imaging/color.ts`, `generate-playbook.ts`). Sideclaw's `check` misreported this as a failure twice this session — verify lint's exit code directly before believing a red.

## Driving the real app — results

Wave 1 was code-complete but entirely unrun going into this session. It has now been driven directly (manual + `osascript`/`screencapture` GUI automation, see `CLAUDE.md` → Local dev). Status against the checklist in the previous handover:

**VERIFIED PASSING:**

1. **Plan → generate round trip.** Confirmed end to end.
2. **Draft-first calibration.** A plain brief correctly prefilled `quality: low`, `n: 4` — not `high`/1.
4. **Non-square reference, size on `auto`.** A 1536×1024 reference produced `params.size: "1536x1024"` on disk — the `ImageBitmap` fix has **not** regressed.
6. **Draft persistence.** Brief, prompt, and settings restored across a real force-quit + relaunch.
7. **The eval tuple writes end-to-end.** `~/Pictures/ImageGen/<id>/metadata.json` shows `schema: 2` and a populated `enhance` block — `additions`, `assumptions`, `warnings`, `enhance_model: "gpt-5.6"` all present.
8. **Library loads all existing generations.** Facets sum correctly against the loaded set.

**PARTIAL:**

3. **Streaming previews.** Previews are on by default and the cost estimate correctly includes the flat +77-token overhead, but no partial frame was visually confirmed on screen during this session — the final-image path was verified, the mid-stream frame was not.
5. **Mask inpaint.** The mask canvas renders at the correct 3:2 aspect ratio for a non-square reference. Actually painting a mask and submitting it was not tested.

**NOT RUN:**

9. **Library inspector actions** — star/role persistence, Re-run, Promote, Tweak, the use-as-edit-reference / use-as-style-source trio, and combining a facet chip with a scope. None of these were exercised this session.

## Known gaps and open decisions

**New this session:**

1. **Edits from the library don't record lineage.** A generation created via "Add from library" as an edit reference gets `parent: null` in its sidecar — the parent/child relationship is not captured. This would break the "see ancestry and descendants in one click" success criterion from the concept doc. **Owner call pending:** should Create's "Add from library" flow set `parent` when the added image becomes the edit source?
2. **⚠️ Transparency is now UNAVAILABLE — a deliberate, temporary capability regression.** Going single-model removed the only model that could emit alpha. gpt-image-2 hard-400s on `background: 'transparent'` and has no alpha channel, so **the studio currently cannot produce a transparent PNG at all**. The enhancer now derives a plain solid white background for icon/logo/cutout briefs and states in `assumptions` that the asset may need manual background removal — it does **not** silently pretend the user got transparency. The restoration path is **local matting via Apple Vision** (`VNGenerateForegroundInstanceMaskRequest`): on-device, permissive licence, zero dependencies, macOS-native, and generating on white is exactly the right input for it. This is the committed path, not an open question. **Chroma-key remains rejected** — `docs/research/transparency-and-vector.md` documents the failure (colour leakage onto the subject, non-uniform "solid" colours, 1px halos). Do not resurrect it.
3. **The painted-checkerboard bug is a live correctness risk, not just a probe curiosity** — see `CLAUDE.md` → Load-bearing API facts. Ask for "a transparent background" in prompt text while sending `background: opaque` and the model **paints a fake checkerboard into the pixels** (`hasAlpha: no`, colortype 2). Since every request is now `opaque`, the playbook's "never write 'transparent background' into prompt text" rule became a **flat prohibition** and is load-bearing, not cosmetic. Any UI or pipeline step that trusts a "transparent" label without checking `hasAlpha`/colortype on the actual PNG is exposed — including a future matting step, which would otherwise inherit checkerboard pixels instead of real alpha.
4. **Cost anchors are per-model.** `shared/src/cost.ts` anchors on gpt-image-2 measurements; gpt-image-1.5 costs ~2.2× more per image at the same quality/size. Now that only gpt-image-2 is generatable this is inert for new work, but it still matters for **costing historical generations** in the library. (See `CLAUDE.md` for the measured numbers; don't re-derive them.)

**Carried forward from the previous session, still open:**

5. **Warning `action` semantics are lossy.** Every warning not resolved via "Apply rewrite" is recorded as `dismissed` — including ones never touched. "Saw it and proceeded" is indistinguishable from "ignored it". The schema offers only `accepted|dismissed`; honest representation needs a third state (`open`). **Owner call pending.**
6. **References don't survive a restart.** The Create draft persists text and settings, not attached `File` blobs.
7. **Additions render as an attributed badge list**, not inline-highlighted (Mantine `Textarea` is plain text). Concept §2 says "visually marked" — badges satisfy the letter, inline marking would be stronger for the anti-silent-rewrite principle.
8. **Style-guide reference images** aren't loaded as edit references yet (concept §3 says they ride along on `/images/edits`).
9. **`preserve_list` is always sent as `[]`** — concept says re-emit each round but never says where it's stored. Related: Promote is direct-enqueue, so it never round-trips `/enhance` and has no preserve list to re-emit. Concept §2 says Promote re-runs "with the preserve list" — if that matters, Promote needs to become a planned path rather than a direct one. **Owner call.**
10. **Tweaking an edit-kind generation loses its reference images** — only prompt + settings carry over. A real gap for "iterate on an edit".
11. **Delete/tombstone flows are unimplemented** (the plan's G5 sketch mentions "delete flows keep children"); it wasn't in the brief, so it wasn't built speculatively.
12. **SVG** — no model emits it natively. VTracer (MIT, cutout mode, precision 3) or LLM-drawn SVG via the wired text model. PRD: post-MVP fast-follow.
13. **Configurable presets** — `app/src/lib/presets.ts` is a hardcoded array. User-editable presets on disk (`~/Pictures/ImageGen/presets.json`) is reasonable but undesigned.
14. **⚠️ Uncommitted fix in another repo.** `~/SourceRoot/basalt-ui` holds a one-line oxlint-preset fix (its preset documented itself with a `"//"` key, which oxlint rejects via `deny_unknown_fields`, breaking `extends` for every consumer). It sits on `feat/s0-mantine-pivot` alongside unrelated work and **still needs its own separate commit + PR**. Consider making basalt-ui's own `.oxlintrc.json` extend its preset so it's finally dogfooded.
15. **Phase B Delivery (Share/Publish) shipped as a generation-level, not per-image, action.** The sidecar's `publications[]` entry (`shared/src/sidecar.ts`) carries no output-image reference, so Share/Publish in `GenerationInspector` always acts on the generation's *first* output image (`metadata.images[0]`) — an `n>1` generation's other outputs currently have no delivery path of their own. This was an unstated assumption resolved during implementation, not a deliberate design call; revisit if per-image delivery turns out to matter. Settings v2 (`app/src/lib/settings.ts`) added the optional `imageShare` connection this depends on, with a v1→v2 migration for the pre-existing flat `{ baseUrl, token }` shape. Still unverified — driving the real app is the only way to confirm the multipart upload and publish round trip against the live image-share instance.

**Deliberate, do not "fix":** plain generation still sends `size: 'auto'`. With no reference image, upstream's own auto-sizing is a real capability. Snapping happens on **replay**, not at generation time.

## Next steps

1. **Finish driving the app.** Streaming previews (visual confirmation of a partial frame), mask inpaint (paint + submit), and every Library inspector action (item 9 above) are still unverified.
2. **Resolve the lineage gap** (item 1 above) — needs an owner decision before more library/lineage work builds on top of it.
3. **Commit.** Nothing is committed. Suggested split: shared contract/playbook → gateway → app data layer → Create → Library → the fs-capability fix. Public repo — no secrets, no endpoint URLs, no internal hostnames.
4. **Wave 2** — Styles surface (currently an `EmptyState` stub), projects, saved searches.

## Session lessons worth keeping

- **Retiring a model is never a subtractive enum edit.** `listGenerations()` silently skips sidecars that fail to parse, so deleting a model id from the schema makes existing library entries vanish with only a log warning — no error, no visible failure, just two-thirds of the library gone. The fix is to split the enums by *path*, not to be careful: `KNOWN_IMAGE_MODELS` (read, never shrinks) vs `IMAGE_MODELS` (generate, safe to shrink). Generalizes past models: any enum that both validates persisted data and constrains new work is really two enums wearing one name.
- **A capability regression must be stated, not absorbed.** Dropping to a single model silently removed transparency. The honest move was to make the enhancer *say so* in `assumptions` rather than quietly hand back an opaque PNG for a "cutout" brief — a studio that pretends it delivered what was asked is worse than one that admits a gap.
- **Contract drift clusters at group boundaries.** Four drifts surfaced in the build session (parent schema, `enhance_model`, additions/assumptions shape, `library.ts` save fields) — every one at a seam where one group's output met another's assumptions. Each schema was internally consistent, so no test could catch them and the agent doing the work couldn't see them. Treat seams as the place to look hardest.
- **`docs/concept.md` §6 was itself internally inconsistent** — its sidecar sample disagreed with its own `/enhance` spec, which is where the additions/assumptions drift originated. Check the spec before blaming the code.
- **Migrate before parse.** Schema 2 requires `schema: 2` with no default and migration never rewrites disk, so any read-then-write path must migrate first. This bug shipped once (`derived.ts`) and was caught twice more in review.
- **Probe rather than reason about runtime semantics.** The `ImageBitmap.close()` bug was settled in seconds by running it in a real browser. The same habit as CLAUDE.md's endpoint-probing rule, applied to the web platform.
- **A green typecheck and 315 passing tests said nothing about whether the app could read its own state directory** — the dot-glob fs-scope bug was invisible to every test and fatal at runtime on first boot. Tests prove logic; they don't prove the app boots.

## If you fan out agents again

**What worked:** disjoint file ownership stated strictly up front; probed facts baked into the brief (a subagent can't see your research); instructing agents to **report contradictions rather than work around them** — that discipline surfaced the `derived.ts` break, the parent-schema conflict, and the unwritable eval tuple, all of which the agent correctly refused to fix outside its ownership.

**What to watch:** agents commenting on files another agent is concurrently rewriting produce **stale claims** — verify before acting. Agents re-implement shared rules unless the brief names an existing home. And **agent self-reports are claims, not proof**: one reported a task complete, with passing tests, that was a runtime no-op. Verify returned diffs against source, and prefer probing reality (live gateway, real sidecars, a real browser, the real running app) over trusting either the agent or the tests.
