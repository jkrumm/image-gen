# Concept: The Studio with a Brain

The product concept behind the 2026-07 redesign. Synthesized from a three-angle design panel (workflow lens, library/DAM lens, prompt-intelligence lens) over live-probed API facts and four research tracks (prompting craft, moderation mechanics, studio UX patterns, prompt-rewriter design). The PRD holds scope and phases; this document holds the mental model, the UX, and the design decisions with their rationale — it is the thing that must stay true as waves ship.

## 1. Mental model

Today the app is organized around *transport*: four tabs that mirror four API shapes (Compose→/generate, Edit→/edits, Refine→local post-processing, Library→disk). The redesign organizes it around *intent*:

You give the system a **Brief**. The **Enhancer** — conditioned by the versioned **Playbook**, an attached **Style Guide**, and the active **Project**'s series context — produces a **Plan**: a crafted prompt plus derived settings, listed assumptions, policy warnings, and an estimated cost. The Plan is always shown before it runs and is always editable; nothing is silent. A run produces a **Generation** (a batch: one job, N images) that lands in the **Library**, linked to its ancestors by **Lineage**. Library images marked with **Roles** feed back into the brain — as style-guide sources, edit references, series anchors, or reusable prompts.

```
Brief ──(Playbook + Style Guide + Project context)──▶ Plan ──▶ Generation ──▶ Library
  ▲                                                    │                        │
  │        show-before-run · editable · warnings ◀─────┘          roles · star · lineage
  └───── "continue from this" / distill style / use as reference ◀──────────────┘
```

Core nouns: **Brief, Plan, Generation, Project, Style Guide, Role, Lineage.** Core verbs: **plan** (enhance), **draft** (cheap, quality low, n>1), **pick** (star), **iterate** (edit/tweak with context carried), **promote** (deliberate quality-high re-run of a winner), **deliver** (refine recipes → exported derivatives), **distill** (images/design.md/CSS → style guide).

Two economic facts shape the whole UX and are not up for re-litigation: quality high costs **35.8×** quality low ($0.211 vs $0.006), so drafting cheap and promoting deliberately is the workflow, not an optimization; and streaming preview overhead is a flat ~+$0.002, so previews default on.

## 2. Information architecture

Three top-level surfaces (SegmentedControl, as today) plus persistent chrome.

| Surface | Contains | Absorbs |
|-|-|-|
| **Create** | Brief field + **Plan card**; references rail (drag-drop, file dialog, **library picker**); mask tool when a reference is primary; Style Guide chip; active-Project chip; intent chip (detected, switchable); every derived setting as a pre-filled editable control; estimated cost before run | Compose + Edit. Generate-vs-edit is an endpoint detail the Plan derives (references attached → `/images/edits`), not a navigation decision |
| **Library** | Sidebar scopes: **All** (append-only history) / **Starred** / **Projects**. Grid of generation cards (search over prompts+params, filter by role/star/project/kind/model). Inspector: outputs, plan record, **lineage panel**, roles editor, **use-as trio**, **Refine as an action**, Tweak vs Re-run differentiated | Library + Refine (the Refine tab dies; its workbench opens from the inspector) |
| **Styles** | Style Guide gallery: palette swatches, vocabulary, reference thumbs, proof renders. "New style guide" from library selection / design.md / screenshot / CSS. Edit + re-distill | New |

Persistent chrome: the existing **QueueBar** (queue architecture unchanged — jobs live above surfaces), and a **Playbook drawer** openable anywhere; every derived setting and warning in the Plan card deep-links to the playbook section that produced it. The app explains itself.

**Create state is persisted** (brief, plan, refs, settings survive restarts as a draft file) — half-finished work is resumable days later without a heavier session entity.

### The Plan card (the heart)

- Brief in → **Plan** (button / Cmd+Enter; never on keystroke). The response renders as:
  - the prompt, editable, with enhancer **additions visually marked** and each assumption a removable chip ("added: soft diffuse light");
  - derived settings pre-filled into the normal controls (model, size, quality, background, n, fidelity, moderation) — every one overridable, none hidden; user-pinned values are echoed verbatim, never derived over;
  - policy verdict inline: green / rewritten-with-diff / warning with one-click rewrite / hard-wall refusal with the playbook explanation;
  - estimated cost ("4 × high ≈ $0.84 — draft at low for $0.02?").
- Aggressiveness is gated by input: short brief → full enhancement; medium → gap-fill only; long/structured expert prompt → passthrough with a banner saying so. A raw toggle skips the enhancer entirely. (The Berkeley finding — silent auto-rewriting erased expert users' precision — is this design's central taboo.)
- Iteration is **delta mode**: from any generation, "continue from this" seeds the Plan with the accepted prompt as context and an empty "what changes?" field; the preserve list is re-emitted automatically each round.

### The Library inspector

- **Lineage panel**: ancestor breadcrumb (walk `parent.id` up) + children grouped by operation (edits, tweaks, promotes, refine exports). Derived pieces stop being invisible. No graph canvas — a clickable list; chains are almost always linear.
- **Use-as trio** on every image: *Use as edit reference* / *Use as style source* / *Reuse prompt + settings*. Every image is one click from being input again — the single affordance that drives the iterate loop.
- **Tweak vs Re-run, finally distinct**: Tweak reopens the Plan for editing; Re-run resubmits verbatim; Promote re-runs at quality high with the preserve list. All three write `parent` + operation.
- **Refine** (recipes, iconset export) hangs here as the deliver step.

## 3. Roles, projects, style guides

**Roles** are a closed, behavioral vocabulary per image — not free tags: `style-source | logo | icon | color-scheme | reference | final | draft`. Behavioral because each drives a feature: `style-source`/`reference`/`logo` populate the Edit reference picker and the Style builder; `final` feeds deliverable filters. Multiple roles per image allowed; **star** is the orthogonal one-bit curation gesture. Free tags are write-only trivia for a single user whose prompts are already rich searchable metadata (the Midjourney lesson: the prompt *is* the metadata).

**Projects** are working contexts, many-to-many with generations. Membership lives in the generation's sidecar (item-authoritative — one writer per fact, full rescan reconstructs everything); `project.json` holds only name, notes, defaults (style guide, intent) and **anchor ids** — the generations whose accepted prompts form the series context. While a project is active in Create, new work auto-files into it (context capture); filing is also retroactive via bulk select.

**Style Guides** are the tier-2 pattern from the studio research (named object from a handful of sources, no training): `{ palette (verbatim hexes with roles), typography feel, vocabulary (medium/texture/mood/lighting), prompt_fragment (≤40 words), avoid[], reference_images[] }`, distilled by the gateway from library images + their prompts, an imported `design.md`, a website screenshot, or parsed CSS (regex-extracted custom properties/hexes/font families handed to the LLM as facts — hexes never paraphrased). Attaching a guide = the fragment woven verbatim into the Plan + its reference images riding along on `/images/edits`. **No strength slider** — GPT Image has no conditioning knob to honor it; the honest controls are channels (fragment only / fragment + N refs).

**Series consistency** comes from prompt context, not chained edits: the Plan receives the project anchors' accepted prompts and reuses their established medium/lighting/palette vocabulary verbatim, varying only the declared delta. Chained edits amplify noise after ~3–5 generations — the Plan warns and offers to re-root on the chain's original base.

## 4. Policy posture

The moderation pre-check is a first-class UX element, built from the playbook's compliance-craft section (`docs/prompting-playbook.md` §8):

- Every Plan classifies the brief: **none / warn / block-likely / hard-wall**. Warns carry a one-click compliant rewrite (visible diff, never silent) and may suggest `moderation: low` for known false-positive-prone artistic subjects.
- Hard-wall categories get a refusal to optimize, with the explanation — the enhancer never phrases around actual policy.
- On an upstream `moderation_blocked` (arrives 503-wrapped), the app surfaces `moderation_stage` + `categories`: input-stage → "deterministic, retry is futile" + targeted rephrase of the offending term class; output-stage → scene-level advice (coverage/medium/framing), one manual retry acceptable. Never auto-retry.
- Gray-zone subjects get the probe-first nudge: one `quality: low` run (~$0.006) before committing to a series.

## 5. User stories (definitive set)

1. **Icon set for a website.** New Project "acme-site" (default style guide attached). Brief: "icon: webhook delivery, line style". Plan detects `icon`, injects flat-design/strong-silhouette vocabulary, derives transparent → gpt-image-1.5 (chip shows the reroute), 1024², low, n=4. Drafts stream in. Star the winner, Promote to high, mark `role: icon`, Refine → `.iconset`. Repeat per concept — project context keeps the set coherent. Total <$1.50 with full lineage.
2. **Landing-page hero matching an existing site.** Styles → New from `tokens.css` + screenshot → gateway distills palette/typography/fragment → save "acme-web". Create: brief + style chip → Plan weaves the fragment, derives 2560×1440/gpt-image-2/high, endpoint edit with 2 style refs, shows ~$0.21 before run. Draft low first, promote the pick.
3. **Journal cover series.** Project "journal-2026" holds three anchors. Brief: "November: first frost on the harbor". Plan reuses the anchors' painterly vocabulary verbatim (impasto, sapphire/ochre, masthead negative space), varies only the subject. Cover #4 reads as the same hand; its accepted prompt becomes anchor #4.
4. **Article images, fast and cheap.** No project. Brief → Plan derives wide, negative space for title, medium quality; user flips to low/n=6 (~$0.04), picks, promotes. $0.25 instead of six high-quality rolls.
5. **Compliant fine-art figure/rope study.** Brief mentions a restraint-adjacent subject → pre-check fires *before spend*: fine-art reframe offered as a diff (decorative knotwork, clothed model, gallery-photograph framing, non-photoreal medium), `moderation: low` suggested, hard-wall combinations named as off-limits, probe-first hint shown. On an output-stage block later: scene-level advice, no futile retries.
6. **Resume after five days.** Create reopens exactly as left (persisted draft state); the project grid shows where the series stood; lineage shows what was already tried.
7. **Edit an old image with library references.** Inspector → Use as edit reference → Create opens with the image as ref 1, its prompt and params seeded, `parent` recorded. "Add reference" opens the in-app library picker filtered to `role: style-source|logo|reference` (toggle: all). The owner's top complaint — Edit is blind to the library — gone.
8. **Seed the DAM with existing brand assets.** Drag 6 external files in → import items (`kind: import`) → bulk-assign roles, file into project. Brand truth now lives where the pickers look.
9. **"Where is that image from three weeks ago?"** Search "lighthouse oil" over prompts/briefs; facet chips narrow by model/role/star/project. Seconds, and the index is rebuildable from sidecars.
10. **Turn three good outputs into a style guide.** Multi-select → "Distill style guide" → gateway returns fragment/palette/vocabulary from images + prompts → optional 4-up low proof sheet (~$0.024) verifies it.
11. **Expert passthrough.** A pasted 140-word crafted prompt → gate detects long/structured → passthrough mode, banner says "your prompt, untouched"; settings still derived and validated.
12. **Doctrine improvement.** Owner edits `shared/playbook/technical.md` (better isometric phrasing), bumps `PLAYBOOK_VERSION`, deploys. Gateway system prompt and in-app drawer update together; every sidecar records which doctrine version produced it.
13. **Headless agent.** Hermes calls `POST /enhance` then `/generate` with the returned settings — same brain, same policy guard, no library. The gateway stays a shared stateless service.
14. **Delivery audit.** Filter project + `role: final`: every shipped asset, its export paths, and the project's cost roll-up.

## 6. Data model (disk-first; sidecars are the sole source of truth)

Generation folders stay exactly as today (append-only history). Sidecar `metadata.json` goes to **schema 2** (additive, migrated on read):

```jsonc
{
  "schema": 2,
  "kind": "generate" | "edit" | "import",
  "parent": { "id": "2026-07-12_...", "image": "image-2.png",
              "op": "tweak" | "rerun" | "edit" | "promote" | "series" | "refine" },
  "project_ids": ["journal-2026"],
  "images": [{ "filename": "image-1.png", "format": "png",
               "roles": ["icon", "final"], "starred": true }],
  "style_guide_ids": ["acme-web"],
  "style_fragment_used": "…",                    // snapshot — guides evolve, records don't
  "enhance": {                                    // the accepted Plan = the eval tuple
    "brief": "…", "intent": "icon", "mode_applied": "full",
    "plan_prompt": "…", "final_prompt_edited": false,
    "assumptions": [{ "slot": "lighting", "text": "…" }],
    "warnings": [{ "code": "…", "severity": "…", "action": "accepted|dismissed" }],
    "series_context_ids": ["…"],
    "playbook_version": "3", "enhance_model": "gpt-5.6"
  },
  "moderation_outcome": { "blocked": true, "stage": "input", "categories": ["…"] } // when blocked
}
```

`~/Pictures/ImageGen/.imagegen/` (all human-readable JSON; Finder-clean dot-dir):

- `projects/<slug>.json` — `{ slug, name, notes, default_style_guide_id?, default_intent?, anchor_ids[] }`. No member list.
- `styles/<slug>/` — `style.json` (shape per §3) + `refs/` (copied reference images) + `sources/` (original design.md / screenshot / CSS, kept for re-distillation).
- `drafts/create.json` — persisted Create state.
- `searches/` — reserved for saved searches (trajectory; not built until roles+search demonstrably fall short).

**Index**: startup scan of sidecars into an in-memory index (search, facets, reverse-lineage edges). No SQLite in the first waves — at personal scale (low thousands of items) this is milliseconds; SQLite+FTS5 is the named escape hatch if scan latency or search quality ever fails, and it would still be a deletable cache.

## 7. Gateway surface (stateless throughout)

**`POST /enhance` v2** (breaking rewrite; nothing calls v1):

```jsonc
// request
{ "brief": "…",                                   // or current_prompt + delta for iteration
  "mode": "auto" | "full" | "gaps" | "off",       // off = policy pre-check + settings only
  "intent": "auto" | "icon" | "hero" | "painterly" | "technical" | "diagram" | "article" | "figure-art" | "texture",
  "overrides": { "size": "2560x1440" },           // user-pinned → echoed verbatim
  "style_guide": { "prompt_fragment": "…", "palette": ["#…"], "avoid": ["…"], "ref_image_count": 2 },
  "series_context": [{ "prompt": "…", "settings": {} }],
  "preserve_list": ["…"], "has_references": true }
// response
{ "intent": { "detected": "icon", "confidence": 0.93 },
  "prompt": "…",                                   // medium-first order + terminal constraint block
  "additions": [{ "slot": "lighting", "text": "…" }],
  "verbatim_check": { "ok": true, "missing": [] },  // server-side containment post-check
  "assumptions": ["…"],
  "settings": { "endpoint": "edit", "model": "gpt-image-1.5", "size": "1024x1024",
                "quality": "medium", "background": "transparent", "n": 4,
                "moderation": "auto", "input_fidelity": "high", "partial_images": 1 },
  "estimated_cost": { "per_image_usd": 0.06, "total_usd": 0.24 },
  "warnings": [{ "code": "restraint_terms", "severity": "warn" | "rewrite" | "hard",
                 "message": "…", "suggested_rewrite": "…", "moderation_suggestion": "low",
                 "predicted_stage": "input" }],
  "mode_applied": "full", "playbook_version": "3" }
```

The LLM proposes; **`rules.ts` disposes** — settings are validated server-side against `MODEL_CAPABILITIES` before the response leaves the gateway. The system prompt is compiled from `shared/playbook/` at startup.

**`POST /styles/distill`** — multipart: ≤6 images + optional text parts (`design_md`, `css`, ≤256 KB each) → the style.json body (fragment, palette, typography, vocabulary, avoid[], confidence). Source hexes/font names are verbatim-preserved.

**`/generate` + `/edit`** — contracts unchanged; the app finally sends `partial_images` (dormant SSE client goes live) and `moderation` per pre-check advice; `moderation_details` (stage/categories) passes through the existing 503-unwrap. **`GET /`** adds `playbook_version`.

**Probe before building** (repo doctrine): whether `/images/edits` accepts `moderation=low` per model on our upstream (historically unsupported on gpt-image-1), and whether `moderation_details` appears in our proxy's wrapped errors.

## 8. The Playbook

`shared/playbook/` — versioned markdown, one source of truth with two consumers: the gateway compiles it into the enhancer system prompt; the app bundles and renders it in the drawer. `core.md` (principles, ordering, anti-hedging, constraint blocks, length budget), per-intent files (`icons.md`, `hero.md`, `painterly.md`, `technical.md`, `article.md`, `figure-art.md`, `diagram.md`), `policy.md` (compliance craft + pre-check heuristics), `PLAYBOOK_VERSION`. Seeded by splitting `docs/prompting-playbook.md` (which remains the human-readable overview and links into the split files). No in-app editor — it's markdown in git.

## 9. Design decisions and rejected alternatives

| Decision | Rejected alternative | Why |
|-|-|-|
| Three surfaces (Create/Library/Styles) | Panel B's no-tab-bar DAM shell; panel A's Studio/Library two-surface | Closest continuous evolution of today's mental model; the create experience deserves a full surface, not a drawer above a grid |
| Plan card as the heart | Chat-shaped enhancer; auto-enhance on keystroke | One structured request/response with editable output; chat invites the model to hold state the disk should hold; always-on is wrong for an expert user |
| "Piece"/work-item entity → trajectory, not now | Panel A's full Piece + bench strip + rounds filmstrip | The strongest novel idea in the panel, but persisted Create state + projects + lineage delivers ~80% at a fraction of the complexity; revisit once multi-round work visibly strains the simpler model |
| In-memory index | SQLite FTS5 now | Personal scale; zero deps; sidecars stay unambiguous; SQLite named as escape hatch |
| Roles: closed multi-role vocabulary + star | Free tags; single-role | Roles are behavioral (they drive pickers/filters); tags are write-only at N=1 |
| Membership in item sidecars | Project member lists; mirrored disk folders / symlinks | One writer per fact; rescan reconstructs; symlinks rot |
| Series via prompt context | Responses-API multi-turn; chained edits | Stateless, cheaper, avoids noise amplification by construction |
| No style strength slider | Firefly-style dual sliders | GPT Image has no conditioning knob; UI must not lie |
| No lineage graph canvas | Zoomable DAG | Chains are near-linear; breadcrumb + grouped children suffices |
| No embeddings/auto-tagging/semantic search | Vision pass over library | Prompt FTS + roles is the retrieval budget at N=1 |
| Promote is always a human click | Auto quality escalation | Spending 36× is a decision, not a default |
| No moderation oracle | Calibrated block simulator | Heuristics + LLM opinion with confidence language; hard walls refuse, gray zones probe |

## 10. Long-term trajectory (designed-for, not built)

Named work-items with a bench strip (panel A's Piece) once multi-round work strains persisted drafts; saved searches once roles+search fall short; screenshot/CSS distillation hardening (wave 2 ships design.md + library images first); SQLite index at scale; enhance eval corpus (the sidecar tuples) as few-shot context for a personalized enhancer; chained-edit drift guard; delivery/cost dashboards; SVG vectorization pipeline (pre-existing fast-follow); local matting for transparency on gpt-image-2 (open decision #1 in the handover — measure before building).
