# image-gen

Personal image-generation studio built on the gpt-image model family.

Two parts:

- **`gateway/`** — a stateless HTTP service (Elysia + Bun) wrapping an OpenAI-compatible image API: generation, editing, reference images, prompt planning (`/enhance`). No database, no storage — images and usage data flow straight through to the client. Deployed on a VPS, reachable only over a private tailnet with bearer auth.
- **`app/`** — a macOS studio app (Tauri v2, React + Mantine/basalt-ui) as the primary client: Plan-driven Create surface, a local-first library with projects, roles, lineage and style guides — every generation lands as a Finder-browsable folder with a JSON metadata sidecar.

A small `shared/` workspace package holds the zod contract and the prompting playbook both sides build against.

## Status

- **Gateway: live on the VPS** (`make gateway-status`, `make gateway-smoke`). Single model, `gpt-image-2`; transparency is an open gap, not scheduled (`AGENTS.md`).
- **Studio app: revived on the MacBook** (its UI machine — see *MacBook install*). Agents never need it: generation from the Mac mini goes through `imgcli gen` (the dotfiles `/img` skill), which calls the same gateway and hands results to image-share.

Scope and waves: [`PRD.md`](PRD.md). Mental model and IA: [`docs/concept.md`](docs/concept.md). Ground truth about the upstream: [`docs/research/endpoint-verification.md`](docs/research/endpoint-verification.md).

## MacBook install

Prerequisites: Xcode Command Line Tools (`xcode-select --install`), a Rust toolchain ≥ 1.85 (`rustup`), and `bun`. The 1Password app signed in to the personal account — `make configure` reads the tokens through it.

```bash
cd ~/SourceRoot && git clone git@github.com:jkrumm/image-gen.git && cd image-gen
bun install --frozen-lockfile
make app          # release build (~70 s warm, ~10 min cold) → /Applications/ImageGen.app, fingerprinted
make configure    # biometric op: seeds gateway + image-share tokens, never asks in-app
make app-run      # refuses to launch an app that is not built from this working tree
```

The library lives at `~/Pictures/ImageGen/` — one folder per generation with its sidecar, plus `.imagegen/` for settings, drafts, projects and style guides. The in-memory index is rebuilt from the sidecars on every start; `.imagegen/` itself is state (tokens, projects, style guides with their reference files, the Create draft) — it lives with the library and is not regenerable. `make app-status` says whether the installed app matches the checkout; `make app-logs` tails `~/Library/Logs/com.jkrumm.image-gen/imagegen.log`.

## Local dev

```bash
bun install
bun run dev        # gateway (:7716, killed+rebound) + Tauri app, concurrently
```

Gateway alone: `bun run --filter '@image-gen/gateway' dev` — upstream creds resolve from 1Password via `secrets-run`; the local bearer is the literal `dev-local` (point the app's settings at `http://localhost:7716` with that token). App alone: `bun run tauri dev` in `app/`. Root `typecheck`/`test` fan out across workspaces the same way (`make check` runs everything).

## Logs

| What | Where |
|-|-|
| App (dev + packaged .app) | `~/Library/Logs/<bundle-identifier>/imagegen.log` via `tauri-plugin-log` (also mirrored to stdout in dev). Captures generation failures, library warnings, and uncaught webview errors. |
| Gateway, local dev | stdout in the terminal — single-line JSON per event. |
| Gateway, VPS | `make gateway-logs` (same JSON lines; greppable, picked up by the VPS monitoring stack). |

Personal software — public for reference, not built for reuse.
