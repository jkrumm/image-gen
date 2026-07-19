# GPT Image Prompting Playbook

The canonical prompting knowledge for this studio has moved to versioned markdown at `shared/playbook/` — two consumers: the gateway compiles it into the enhancer system prompt (`composePlaybookSystemPrompt` in `shared/src/playbook.ts`), and the app bundles + renders it in the in-app Playbook drawer (docs/concept.md §2, §8). This file is now the human-readable overview and index; edit the doctrine itself in `shared/playbook/`.

Sources: OpenAI's official image-gen prompting guides, community practitioner consensus, and the leaked/published behavior of production prompt rewriters (DALL·E 3, Ideogram Magic Prompt, Leonardo, Krea). Research snapshots with citations live in the session archives; load-bearing API facts (capabilities, costs, moderation mechanics) are probe-verified against our own endpoint — see `CLAUDE.md` and `docs/research/endpoint-verification.md`.

`PLAYBOOK_VERSION` (`shared/src/playbook.ts`) is bumped whenever a change here affects enhancer output; every generation's sidecar records which version produced it (docs/concept.md §6, §9 below).

## Index

Always-on, compiled first into every system prompt:

- [`shared/playbook/core.md`](../shared/playbook/core.md) — core principles, photorealism counters, negative constraints, series consistency, text in images, camera/lighting vocabulary, failure modes quick reference.
- [`shared/playbook/settings.md`](../shared/playbook/settings.md) — settings derivation table + cost anchors.
- [`shared/playbook/policy.md`](../shared/playbook/policy.md) — content-policy mechanics, calibration, hard boundaries, false-positive trigger table, enhancer duties.

Per-intent recipes, appended for the detected/requested intent only:

- [`shared/playbook/icons.md`](../shared/playbook/icons.md) — icons, logos, flat graphics.
- [`shared/playbook/hero.md`](../shared/playbook/hero.md) — hero/banner/cover images (general).
- [`shared/playbook/article.md`](../shared/playbook/article.md) — blog/article hero images specifically.
- [`shared/playbook/painterly.md`](../shared/playbook/painterly.md) — painterly/oil/impressionist (journal covers, art).
- [`shared/playbook/technical.md`](../shared/playbook/technical.md) — product renders, UI mockups, isometric/exploded views.
- [`shared/playbook/diagram.md`](../shared/playbook/diagram.md) — diagrams and infographics.
- [`shared/playbook/figure-art.md`](../shared/playbook/figure-art.md) — craft guidance for sensitive-but-allowed fine-art figure subjects (policy mechanics stay in `policy.md`).

## Enhancer contract (summary)

The full spec lives in the PRD and in `shared/src/plan.ts` (`planRequestSchema` / `planResponseSchema` — the `POST /enhance` v2 contract, docs/concept.md §7); the load-bearing rules:

1. **Verbatim preservation** — every concrete noun, quantity, color, name, and quoted string in the brief must survive into the prompt. The rewriter only *adds*, never substitutes.
2. **Aggressiveness gating** — short brief (<~25 words) → full enhancement; medium → gap-fill only; long/structured expert prompt → formatting + constraint block only, and say so. Explicit "don't rewrite" escape hatch (`mode: "off"`).
3. **Gap-fill from a fixed slot list** (medium, lighting, composition, palette/mood, background) — each fill recorded in `assumptions[]` so the UI shows "what I added" vs "what you said".
4. **Show-before-run, always editable, never silent.** Generation uses whatever is in the editable field. (The DALL·E 3 rewriter's silent substitutions and the Berkeley finding that auto-rewriting erased expert users' precision are the cautionary tale.)
5. **Settings derivation per `settings.md`** with echo-verbatim override; policy pre-check per `policy.md`.
6. Output is structured JSON per `planResponseSchema`: `{ intent, prompt, additions[], verbatim_check, assumptions[], settings, estimated_cost, warnings[], mode_applied, playbook_version }`; the prompt itself is prose in `core.md`'s canonical order.
7. Remember the upstream also rewrites internally (no disable switch) — don't over-invest in micro-wording.
