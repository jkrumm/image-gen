# image-gen

Personal image-generation studio built on the gpt-image model family.

Two parts:

- **`gateway/`** — a stateless HTTP service (Elysia + Bun) wrapping an OpenAI-compatible image API: generation, editing, reference images, prompt enhancement. No database, no storage — images and usage data flow straight through to the client. Deployed on a VPS, reachable only over a private tailnet with bearer auth.
- **`app/`** — a macOS studio app (Tauri v2, React + Tailwind) as the primary client: prompt composer, parameter control, and a local-first library — every generation lands as a Finder-browsable folder with a JSON metadata sidecar.

Status: **pre-implementation.** See [`PRD.md`](PRD.md) for scope and phases, and [`docs/research/`](docs/research/) for the decisions behind the stack.

Personal software — public for reference, not built for reuse.
