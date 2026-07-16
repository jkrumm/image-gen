# PRD: image-gen — Personal Image Generation Studio

## Problem

I design apps, generate art (journal cover images), and create icons, but have no personal tool for it — just ad-hoc prompting in chat UIs with no parameter control, no library, no iteration workflow. I already run a unified OpenAI-compatible LLM endpoint that exposes `gpt-image-2` (verified working — see `docs/research/endpoint-verification.md`), and I have an established pattern for small stateless VPS gateways (Tailscale-only, bearer auth, Bun + Elysia).

## Goals

1. **image-gen-gateway** — a stateless HTTP service on the VPS wrapping the gpt-image model family behind a clean, typed API. No database, no image storage: requests in, images (base64) + usage/cost out. Reachable only over the tailnet; usable later by other agents (Hermes, Claude Code) via plain REST.
2. **A beautiful macOS app** (Tauri v2 — decision rationale in `docs/research/desktop-framework.md`) that is the primary client: compose prompts, pick model/size/quality, view results, iterate, and keep the entire library on local disk.
3. **Local-first library** — every generation (inputs, outputs, parameters) lands in a human-browsable folder structure with JSON metadata sidecars. The app owns state; the gateway owns none.

## Non-goals

- MCP facade on the gateway (REST is enough for agents).
- SVG vectorization (post-MVP fast-follow, see below).
- Public internet exposure, multi-user, auth beyond a bearer token.
- Cloud/server-side image storage or a database anywhere.
- Windows/Linux, App Store distribution, auto-update infrastructure.

## MVP scope (phased — each phase ships working software)

### Phase 1 — Core loop
- Gateway: `generate` endpoint (text-to-image) proxying `/images/generations`; model routing (`gpt-image-2` default, `gpt-image-1.5` for transparency, `gpt-image-1-mini` as cheap tier); size/quality/format/background params; usage + estimated cost in every response; bearer auth; OpenAPI spec; Docker deploy on the VPS, Tailscale-only.
- App: prompt composer with parameter controls, generation view, library on disk (`~/Pictures/ImageGen/<generation-id>/` with images + `metadata.json`), gallery/history browser with detail view (prompt, params, cost), re-run/tweak from any past generation.

### Phase 2 — Editing & references
- Gateway: image editing/inpainting and reference-image generation. Note: `/images/edits` is broken upstream for GPT Image models; the editing path is the Responses API `image_generation` tool — verify passthrough first (see `docs/research/endpoint-verification.md`, "Still unverified").
- App: drag-drop input images, mask drawing for inpainting, "iterate on this image" flow feeding outputs back as inputs.

### Phase 3 — Prompt enhancement & polish
- Gateway: optional LLM prompt-enhancement step (short brief → refined prompt via a text model on the same endpoint), returned alongside the image so the library records both.
- App: purpose presets (journal cover, app icon, art) that pre-fill size/quality/model routing; streaming partial-image previews if passthrough works.

## Post-MVP fast-follow (named, not built)

**Smart SVG icon pipeline** — generate raster icon (transparent via `gpt-image-1.5`) → vectorize (vtracer/potrace and/or LLM-drawn SVG) → preview and store SVG alongside the raster. Quality of vectorization is its own research task.

## Key constraints (from research — details in `docs/research/image-api.md`)

- gpt-image-2 has **no transparent background** support → model routing is a first-class gateway concern, not an afterthought.
- Editing must go through the Responses API until the `/images/edits` upstream bug is fixed.
- GPT Image models always return base64 — which fits the stateless design: the gateway never touches disk.
- Full token usage is returned per generation → cost shown in the app per image and aggregated in the library.

## Success criteria

1. From the app: type a prompt, get an image in seconds, and find it — with its full parameters and cost — in a Finder-browsable folder without the app running.
2. An icon with a transparent background and a 2560×1440 journal cover are both one preset click away.
3. Take any past generation, tweak its prompt or feed it back as an edit input, and get a new linked generation.
4. `curl` with a bearer token from any tailnet machine generates an image — proving the gateway is client-agnostic.
5. The gateway survives redeploys with zero state loss because it has no state.

## Architecture (one paragraph, intentionally high-level)

Bun monorepo: `gateway/` (Elysia + Bun, official `openai` SDK pointed at the unified endpoint, typed contract shared with the app, Docker + Makefile deploy following the research-gateway/audio-gateway pattern) and `app/` (Tauri v2, React + Tailwind v4, basalt-ui as design foundation, `tauri-plugin-fs`/`-dialog` for the library, `tauri-plugin-macos-fps` for ProMotion). Implementation details are the implementing agent's call within these boundaries.
