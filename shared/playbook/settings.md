# Settings Derivation

This studio's rules for turning a brief into concrete generation settings. The enhancer derives these; every derived value surfaces as an editable control, never hidden. Explicit user values are echoed verbatim and never overridden — see `overrides` in the `/enhance` v2 contract (`shared/src/plan.ts`).

## Quality and n — draft-first by default

**This is the most expensive decision you make. Get it right before anything else.**

`high` costs **35.8×** what `low` costs ($0.211 vs $0.006 per image at 1024×1024). This studio is an iteration loop, not a one-shot renderer: the user almost always wants several cheap candidates to choose from, then promotes the winner. Promoting later is one click; money spent on a high-quality render of the wrong composition is gone.

**Default, applied unless a rule below overrides it: `quality: low`, `n: 4`.**

Escalate only on an explicit signal:

| Signal                                                                                | quality  | n   |
| ------------------------------------------------------------------------------------- | -------- | --- |
| _(no explicit signal — the common case)_                                              | `low`    | 4   |
| "draft / try / explore / variations / options / ideas"                                | `low`    | 4–6 |
| "final / print / ship / publish / for the site" — an explicit finalization request    | `high`   | 1   |
| Dense rendered text is central to the image (a poster's headline, a diagram's labels) | `medium` | 2   |
| Iteration on an accepted prompt (a delta re-run) whose parent already ran `high`      | `high`   | 1   |
| The policy pre-check predicts an **input** block (`predicted_stage: "input"`)         | `low`    | 1   |

Rules for combining them:

- **`high` implies `n: 1`.** Never propose `high` with `n > 1` — that is a $0.85+ request off a single brief. If the brief wants both variety and finish, propose `low` with a high `n` and say in `assumptions` that the winner should be promoted.
- **A subject being hard is not a finalization signal.** Photoreal portraits, intricate icons, and detailed illustrations still _draft_ at `low`. Difficulty is a reason to iterate more, not to pay 35.8× on the first attempt.
- **Never spend `high` on a request you predict will fail.** If the policy pre-check raises a `hard`- or `rewrite`-severity input-stage warning, the request likely never reaches the renderer — derive `low`/`n: 1` and say why in `assumptions`.
- Whatever you derive, name the two-step in `assumptions` when you chose `low` for something the user may consider finished work (e.g. "drafting 4 at low ≈ $0.024; promote the winner to high ≈ $0.211").

## Model — one model, always

**This studio generates on `gpt-image-2` and nothing else.** Never propose `gpt-image-1.5` or `gpt-image-1-mini`; they are retired from the generate path. (They still appear in the library on old generations — that is the read path, and it is none of your concern when deriving settings.)

Because there is only one model, there is no routing decision left to make. What follows is about size and the remaining parameters.

## Size — arbitrary `WxH` is always available

gpt-image-2 accepts **arbitrary custom sizes on both generate and edit**. There are no presets-only cases anymore; never constrain a size because "the model only takes presets". The envelope:

- width and height are **multiples of 16**
- aspect ratio **≤ 3:1** in either direction
- total area **655,360–8,294,400 px**
- longest edge **< 3840**

Derive the size the brief actually wants and let `shared/src/rules.ts` snap it if it lands off-grid.

## The rest

These derive from the brief's _shape_, independent of the quality decision above:

| Signal in the brief                                     | Derivation                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Icon / logo / avatar / sticker                          | square 1024; plain solid white background — see "Background treatment" below                                                                                                                           |
| Cover / banner / hero / wallpaper                       | wide custom size; 2560×1440 for journal covers                                                                                                                                                         |
| Poster / portrait subject / phone                       | tall — 1024×1536, or a custom tall `WxH`                                                                                                                                                               |
| Transparency ("transparent", "cutout", "no background") | **not available** — derive `background: opaque` with a plain solid white background, and say so in `assumptions`. See "Background treatment"                                                           |
| Edit with identity/product fidelity concerns            | nothing to derive — **never send `input_fidelity`**. gpt-image-2 rejects the parameter outright (hard 400) and is locked to high fidelity internally, so the behaviour you want is already the default |

The capability matrix is enforced by `shared/src/rules.ts`, not here — this table only describes what to _derive_; `rules.ts` disposes.

## Background treatment: transparency is currently unavailable

**The studio has no model that can emit transparency.** gpt-image-2 has no alpha channel and hard-400s on `background: "transparent"` (probe-verified), and it is the only model in the generate path. This is a deliberate, temporary capability regression, not an oversight.

So: **never derive `background: "transparent"`.** For any brief that wants a cutout, a sticker, a logo, or an icon "with no background":

- derive `background: "opaque"` and put **"on a plain solid white background"** into the prompt text as an explicit rendering instruction;
- state plainly in `assumptions` that **transparency is not currently available and the asset may need its background removed manually**. Never let the user believe they received a transparent PNG when they did not.

The restoration path, when it is built, is local matting on that plain-white render (Apple Vision `VNGenerateForegroundInstanceMaskRequest` — on-device, permissive, zero dependencies; see `docs/research/transparency-and-vector.md`). Generating on white is therefore not just a fallback, it is the correct input for that pipeline.

### Prompt text must match the `background` parameter

**The prompt text must never assert a background treatment that contradicts the `background` parameter this request sends.** Probe-verified failure: send `background: "opaque"` while the prompt says "isolated on a transparent background", and the model does not ignore the mismatch — it **paints a fake transparency checkerboard directly into the image pixels**. The output has no alpha channel (opaque RGB, colortype 2) and the checkerboard is baked-in garbage, not real transparency. This is a real, previously-shipped bug caused by exactly this contradiction. Since `background: transparent` is now never derivable, the rule reduces to a flat prohibition:

- **Never emit the words "transparent background" (or "cutout", "no background", or any checkerboard/transparency-pattern description) into prompt text.** There is no longer any request shape in which those words are correct. This is the exact failure above, by name, on record so it doesn't get "simplified away" in a future edit.
- **Always specify the background explicitly** — default to "on a plain solid white background", phrased as a deliberate rendering instruction, never left implicit.
- **Never suggest chroma-key / green-screen generation as a transparency workaround.** It is a separate, documented failure — colour leakage onto the subject, non-uniform "solid" colours, 1px halos (`docs/research/transparency-and-vector.md`) — not a fallback for cases where alpha isn't available.

## Cost anchors

Cost anchors (probe-measured, gpt-image-2 @ 1024×1024): low ≈ $0.006, high ≈ $0.211 per image; streaming preview costs a flat ~+$0.002 — default it on. Implemented as `estimateCost()` in `shared/src/cost.ts`, which scales these anchors linearly with pixel count relative to 1024×1024. Anchors are per-model; since gpt-image-2 is the only model you can derive, these are the only numbers you need.
