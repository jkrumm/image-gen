# image-gen

Personal image-generation studio: a stateless VPS gateway (`gateway/`) wrapping the gpt-image model family + a Tauri v2 macOS app (`app/`) that owns all state on local disk.

**Start here:** `PRD.md` (scope, phases, success criteria) → `docs/research/` (API surface, framework decision, endpoint verification). Implementation follows the PRD phases; each phase ships working software.

## Repo layout

| Path | What |
|-|-|
| `gateway/` | Elysia + Bun HTTP service. Stateless — no DB, no image storage. Docker on the VPS, Tailscale-only, bearer auth. |
| `app/` | Tauri v2 macOS app. React + Tailwind v4 + basalt-ui. Owns the library at `~/Pictures/ImageGen/`. |
| `docs/research/` | Dated research findings. Treat as snapshots — re-verify time-sensitive claims (API bugs, versions) before relying on them. |

## Conventions

- **Public repo.** Never commit secrets, internal hostnames, or endpoint URLs — the upstream LLM endpoint base URL and API key resolve from 1Password (`op://common/anthropic/OPENAI_BASE_URL`, `op://common/anthropic/API_KEY`) via `.env.tpl` templates. Placeholders only in docs.
- Direct-to-master, no ticket prefixes, conventional commits.
- Bun everywhere (`bun install --frozen-lockfile`); TypeScript strict; pin direct deps exact.
- Gateway follows the established personal-gateway pattern (typed contract, OpenAPI, bearer auth, Makefile-driven Docker deploy) — mirror `research-gateway`/`audio-gateway` structure where sensible, and reuse the `generateImage()` patterns from `sideclaw/server/lib/iu-openai.ts` (retry set, 410 fail-fast, PNG magic-byte check, usage sink).
- basalt-ui changes stay in the basalt-ui repo with their own separate commits — never vendored or committed from here.

## Load-bearing API facts (verified 2026-07, sources in docs/research/)

- gpt-image-2 does **not** support transparent backgrounds → transparency requests route to `gpt-image-1.5`.
- `/v1/images/edits` 400s upstream for GPT Image models → editing goes via the Responses API `image_generation` tool (passthrough still unverified — probe before building Phase 2).
- GPT Image models always return `b64_json`; usage tokens are in every response (surface cost per generation).
