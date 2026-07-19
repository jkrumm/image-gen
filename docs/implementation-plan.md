# Implementation plan — Studio-with-a-Brain redesign

Execution plan for the waves defined in `PRD.md`, structured for multi-agent fan-out. Every implementing agent's brief must include: the relevant `docs/concept.md` sections, the baked facts below, its exact file ownership, and the standing orders from `docs/handover.md` → "If you fan out agents again" (disjoint ownership, report contradictions instead of working around them, don't re-implement shared rules — point at their home).

## Standing facts to bake into every brief

- `shared/src/rules.ts` is the single source of truth for model routing/size/fidelity validation. The enhancer LLM *proposes* settings; `rules.ts` *disposes*. Never re-derive rules in a view or route.
- Capability matrix: gpt-image-2 = custom size / no transparency / rejects `input_fidelity`; 1.5 = presets-only / transparency / fidelity; mini = cheap. Transparency auto-routes to 1.5.
- Upstream wraps 400-class user errors in HTTP 503 with `"type": "..._user_error"`; `moderation_blocked` is one; never retried. SSE event names are per-endpoint (`image_generation.*` vs `image_edit.*`) — match on suffix.
- Costs: quality low ≈ $0.006, high ≈ $0.211 (35.8×), streaming flat +$0.002; upstream may deliver fewer partials than requested.
- Validation: `bun run pre` + `cd gateway && bun test`. **There are no app-side tests; green typecheck ≠ working app** — say so in reports. Scope typechecks (`cd app && bunx tsc --noEmit -p tsconfig.app.json`) while other agents are in flight.
- Probes: `cd gateway && secrets-run run --env-file=.env.local.tpl -- bun <scratch>/probe.ts`; scratch files never in the repo; elide `b64_json` when printing.
- Runtime verification of anything Tauri (capabilities, plugin-http, canvas) happens on the MacBook only.

## Wave 0 — human gate (blocks everything)

1. On the MacBook: `bun run dev`, drive the six handover scenarios (plain generate, streamed generate, 2-ref edit, masked inpaint, library→edit seed, `/enhance` curl). Fix what breaks; commit the MVP.
2. ~~Probe A~~ **done 2026-07-17**: `moderation=low` accepted on `/images/edits` (gpt-image-2 and 1.5).
3. ~~Probe B~~ **done 2026-07-17**: `moderation_details` present (`moderation_stage`, coarse `categories`); 503 body is a string-prefixed wrapper — extract the embedded JSON. Our upstream is more permissive than public reports (celebrity portrait passed; living artist input-blocked; franchise character output-blocked) → pre-check is advisory.
4. Results recorded in `docs/research/endpoint-verification.md` (Round 3). Only item 1 (driving the app) remains for wave 0.

## Wave 1 groups (dependency order; ∥ = parallelizable, disjoint files)

### G1 — shared: playbook + contract v2 (first; everything depends on it)
**Owns:** `shared/src/**`, `shared/playbook/**`, `docs/prompting-playbook.md` (link updates only).
- Split `docs/prompting-playbook.md` into `shared/playbook/` (`core.md`, `icons.md`, `hero.md`, `painterly.md`, `technical.md`, `article.md`, `figure-art.md`, `diagram.md`, `policy.md`) + `PLAYBOOK_VERSION` export; the docs file becomes the overview linking in.
- Contract v2: enhance request/response schemas exactly per `docs/concept.md` §7 (modes, intent enum, overrides, style_guide, series_context, preserve_list, has_references → prompt, additions, verbatim_check, assumptions, settings incl. endpoint, estimated_cost, warnings, mode_applied, playbook_version). Sidecar schema-2 types per §6 (kind incl. import, parent {id,image,op}, project_ids, per-image roles/starred, style_guide_ids, enhance record, moderation_outcome). Style guide + project JSON schemas. Cost-estimation helper (tokens→USD from the measured table) in shared.
- zod v4; `.shape` survives `.superRefine()` (pinned pattern in `metadata.ts`).

### G2 ∥ — gateway: enhance v2 + moderation passthrough (after G1)
**Owns:** `gateway/src/**` (routes/enhance.ts, lib/enhance.ts → plan builder, playbook compiler, upstream.ts error unwrap, index.ts discovery), gateway tests.
- System prompt compiled from `shared/playbook/` at startup; implements verbatim-preservation with a server-side containment post-check, length-gated aggressiveness, anti-hedging, gap-fill slot list recorded as additions/assumptions, settings proposal → validated through `rules.ts` (echo user overrides verbatim), policy warnings per `playbook/policy.md` heuristics, cost estimate via the shared helper.
- `moderation_details` passthrough per Probe B's observed shape; `GET /` adds `playbook_version`. Structured-output call pattern: reuse `callEnhanceModel`'s upstream wiring; response must parse against the contract schema, retry once on mismatch, 502 after.
- Elysia gotchas apply (422 vs 400; generator-return validation skip; multipart body-less schema). Tests: extend the existing 63; cover verbatim check, override echo, capability-matrix correction, warning classification (fixture briefs), cost math.

### G3 ∥ — app data layer: schema 2 + index (after G1; parallel with G2)
**Owns:** `app/src/lib/metadata.ts`, `app/src/lib/library.ts`, new `app/src/lib/index.ts` (in-memory index), new `app/src/lib/studio-store.ts` (`.imagegen/` projects/styles/drafts IO).
- Read-time migration schema 1→2 (defaults: kind from existing field, parent from parent_id, empty roles/projects). Write schema 2 on all new saves.
- In-memory index built from a startup sidecar scan: text search over prompt/brief, facets (model/kind/roles/star/projects), reverse-lineage edges (children lookup). No SQLite.
- `.imagegen/` read/write: projects, styles (folder + refs + sources), `drafts/create.json`.

### G4 — app Create surface (after G2 + G3)
**Owns:** `app/src/views/Create.tsx` (new; replaces Compose.tsx + Edit.tsx), `app/src/lib/queue.ts`, `app/src/lib/gateway.ts` (enhance v2 client + streaming call sites), `app/src/App.tsx`.
- Merge Compose+Edit per concept §2: references rail with **library picker** (filtered by roles, toggle to all), mask tool when a ref is primary, endpoint derived from refs presence.
- Plan card: brief → `POST /enhance`; render editable prompt with additions marked (chips removable), derived settings prefilled into existing controls, warnings with one-click rewrite application, cost-before-run; explicit Plan action (button/Cmd+Enter), raw toggle; persisted draft state via studio-store.
- Streaming on by default for n=1 (wire the dormant `generateStream`/`editStream` through the queue; progressive partial slots; never wait for a fixed partial count). Moderation-block recovery UX: stage-aware messaging, targeted rephrase via `mode: "gaps"` re-plan, no auto-retry.
- App.tsx: SegmentedControl → Create / Library / Styles (Styles can be a stub panel until Wave 2); seeds rewired (EditorSeed/ComposerSeed → Create with context; RefineSeed stays for the inspector action).

### G5 — app Library surface (after G4 — App.tsx and seed contracts settle there)
**Owns:** `app/src/views/Library.tsx`, `app/src/views/Refine.tsx` (relocation only), new inspector components.
- Sidebar scopes (All/Starred/Projects placeholder), search + facet chips over the G3 index.
- Inspector: lineage panel (ancestor breadcrumb + children grouped by op, refine derivatives included), roles editor + star, use-as trio, Tweak (reopen Plan) / Re-run (verbatim) / Promote (quality high + preserve list) as distinct ops writing `parent`, Refine as inspector action; delete flows keep children (tombstone in chain).

### G6 — docs + CLAUDE.md sync (after G5; small, inline or single agent)
CLAUDE.md repo-layout/validation updates (Create/Library/Styles, schema 2, playbook path, enhance v2), handover.md rewrite for the new state.

## Wave 2 groups (sketch; brief fully only when wave 1 is verified on the MacBook)

- **G7 gateway:** `POST /styles/distill` (images + design_md; CSS/screenshot deferred to wave 3) with verbatim-hex preservation tests.
- **G8 app:** Projects (context capture, bulk filing, anchors → series_context in Plans, cost roll-up).
- **G9 app:** Styles surface + attach chip + proof sheet; imports (`kind: import`, drag-in, bulk role assignment).

## Orchestration notes

- One agent per group, complete briefs (paths, shapes, acceptance criteria, scope limits), `@implementer`-style literal execution; G2∥G3 is the only concurrent pair in wave 1 — they share zero files.
- After each group: scoped typecheck + (gateway) `bun test`; full `bun run pre` only when no agent is mid-flight.
- Report, don't work around: any contradiction between this plan, `docs/concept.md`, and the code is a finding, not an obstacle.
- App-side runtime remains unverified until driven on the MacBook — every report must say so. Wave 1 ends with a handover listing exactly what to drive.
