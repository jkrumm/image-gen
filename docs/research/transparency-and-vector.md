# Research: transparency without native alpha, and SVG output (2026-07-16)

Question: gpt-image-2 has the best quality but **cannot** emit transparency. Should we generate on gpt-image-2 and strip the background ourselves, instead of routing to `gpt-image-1.5`? And can we ship SVG?

**Status: decision-ready, not decided.** Nothing here is built. Sources at the bottom.

## The actual tradeoff

We have a working transparency path today: `background: "transparent"` → `gpt-image-1.5` → real alpha PNG (probe-verified). It costs nothing to maintain and needs no dependencies.

The case for post-processing gpt-image-2 instead is **not** "1.5 doesn't work" — it's that gpt-image-2 has a better backbone (notably text rendering) and arbitrary sizes, so `gpt-image-2 + matting` could beat `gpt-image-1.5 native` on *subject* quality while keeping alpha. That's a quality bet, and it is **unmeasured**. Icons are also the case where 1.5's weaknesses matter least (simple, few elements, little text).

**Nobody has compared the two outputs.** That comparison is cheap (two generations + one matting run) and should happen before any pipeline is built.

## Option A — keep `gpt-image-1.5` native alpha (status quo)

Zero deps, zero new failure modes, works today. Ceiling is 1.5's quality, and it forfeits custom sizes for transparent assets (1.5 is presets-only) — so "transparent 2560×1440" is impossible by construction.

## Option B — gpt-image-2 → background removal

Generate opaque on gpt-image-2, strip the background locally.

| Approach | Icons/flat art | Hair/soft | Commercial license | Notes |
|-|-|-|-|-|
| **Apple Vision** `VNGenerateForegroundInstanceMaskRequest` | ★★★ | ★★★ | ✅ OS built-in | macOS 14+, on-device, **zero deps**, Neural Engine. Natural fit for a Tauri macOS app (needs Rust↔ObjC interop). Not on Simulator. |
| **BiRefNet** (`birefnet-general`) | ★★★★ | ★★★★★ | ✅ permissive | SOTA. ~1GB torch / ~170MB ONNX. Needs a Python sidecar or ONNX runtime. |
| **rembg** + `u2net`/`isnet` | ★★★★ | ★★ | ✅ MIT | Python sidecar. Fast, hard edges — *good* for icons (soft edges vectorize badly). |
| **RMBG-2.0** (BRIA) | ★★★★★ | ★★★★★ | ❌ **CC BY-NC** | Best quality; commercial use needs a paid BRIA license. |
| `@imgly/background-removal-node` | ★★★★ | ★★★ | ⚠️ **AGPL v3** | Pure Node/Bun, but AGPL is viral — **this repo is public**. Avoid. |

**Licensing is the sharp edge here.** RMBG-2.0 (non-commercial) and @imgly (AGPL) are the two most convenient options and both are disqualified-or-encumbered for a public repo. Permissive picks: Apple Vision (free, native) or BiRefNet (permissive weights).

**Recommendation if we go this route: Apple Vision first.** No dependency, no license, no sidecar, on-device, and the app is already macOS-only. Its weakness (fine hair) is irrelevant for icons — which is the entire transparency use case in the PRD.

## Option C — difference matting (no ML at all)

Documented trick: generate on pure white → **edit the same image to pure black** → per-pixel `alpha = 1 - (pixelDist / bgDist)`, `bgDist = sqrt(3×255²) ≈ 441.67`. Intermediate values give genuine soft alpha.

Appealing because it needs **no new dependency** and reuses our existing `/edit` endpoint. But: costs **2 generations** per asset, and depends on the model preserving the subject *exactly* across the edit. Verified on Nano Banana Pro 2; **not tested on gpt-image-2**. Probe before believing.

Chroma-key (green screen) is documented as a **failure** — color leakage onto the subject, non-uniform "solid" colors, and 1px halos. Don't.

## SVG

- **No image model emits SVG natively** as of mid-2026 — every one returns raster. SVG comes from tracing, or from an LLM *writing* SVG markup as code.
- **VTracer** (MIT, O(n)) is the best raster→SVG for our case. For icons: low color precision (2–4) + **cutout** mode (stacked mode is for photos; getting this wrong yields unusable SVGs).
- **Potrace** (GPL-2.0) is excellent but monochrome-only, and GPL is a licensing consideration here.
- **LLM-drawn SVG** (prompt a text model for SVG markup) is viable for simple icons and needs zero image pipeline — but hallucinates invalid paths, so it must be parsed/validated. We already have a text model wired (`/enhance` → `gpt-5.6`), so this is the cheapest experiment available.
- Research-grade (OmniSVG, StarVector) beat classical tracers but need GPU inference — not worth it here.

Pipeline if built: `generate on white → remove background → VTracer (precision 3, cutout) → svgo`.

## What to do next (in order)

1. **Measure before building.** Generate the same icon prompt via `gpt-image-1.5` (native alpha) and via `gpt-image-2` + Apple Vision matting. Compare. If 1.5 is good enough, Option A wins on simplicity and this whole document is moot.
2. If gpt-image-2 wins, prototype **Apple Vision** (Option B) — permissive, dep-free, macOS-native.
3. Probe **Option C** on gpt-image-2 (does an edit preserve the subject pixel-for-pixel?) only if a dependency-free path is wanted.
4. SVG last, and start with **VTracer** on an already-transparent icon.

## Sources

- https://github.com/danielgatis/rembg · https://github.com/zhengpeng7/birefnet · https://github.com/Bria-AI/RMBG-2.0
- https://developer.apple.com/documentation/vision/vngenerateforegroundinstancemaskrequest
- https://www.createwithswift.com/removing-image-background-using-the-vision-framework
- https://github.com/imgly/background-removal-js (AGPL) · https://huggingface.co/VincentGOURBIN/RMBG-2-CoreML
- https://jidefr.medium.com/generating-transparent-background-images-with-nano-banana-pro-2-1866c88a33c5 (difference matting)
- https://github.com/visioncortex/vtracer · https://en.wikipedia.org/wiki/Potrace · https://github.com/OmniSVG/OmniSVG · https://starvector.github.io
