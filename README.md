# image-gen

Personal image-generation studio built on the gpt-image model family.

Two parts:

- **`gateway/`** — a stateless HTTP service (Elysia + Bun) wrapping an OpenAI-compatible image API: generation, editing, reference images, prompt enhancement. No database, no storage — images and usage data flow straight through to the client. Deployed on a VPS, reachable only over a private tailnet with bearer auth.
- **`app/`** — a macOS studio app (Tauri v2, React + Mantine/basalt-ui) as the primary client: prompt composer, parameter control, and a local-first library — every generation lands as a Finder-browsable folder with a JSON metadata sidecar.

A small `shared/` workspace package holds the zod contract both sides build against.

Status: **Phase 1 implemented** (text-to-image core loop). See [`PRD.md`](PRD.md) for scope and phases, and [`docs/research/`](docs/research/) for the decisions behind the stack.

## Local dev

```bash
bun install
bun run dev        # gateway (:7716, killed+rebound) + Tauri app, concurrently
```

Gateway alone: `bun run --filter '@image-gen/gateway' dev` — upstream creds resolve from 1Password via `secrets-run`; the local bearer is the literal `dev-local` (point the app's settings at `http://localhost:7716` with that token). App alone: `bun run tauri dev` in `app/` (needs Rust ≥ 1.85).

## Logs

| What | Where |
|-|-|
| App (dev + packaged .app) | `~/Library/Logs/<bundle-identifier>/imagegen.log` via `tauri-plugin-log` (also mirrored to stdout in dev). Captures generation failures, library warnings, and uncaught webview errors. |
| Gateway, local dev | stdout in the terminal — single-line JSON per event. |
| Gateway, VPS | `docker logs image-gen-gateway` (same JSON lines; greppable, picked up by the VPS monitoring stack). | Root `typecheck`/`test` fan out across workspaces the same way.

Personal software — public for reference, not built for reuse.
