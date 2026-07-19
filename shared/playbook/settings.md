# Settings Derivation

This studio's rules for turning a brief into concrete generation settings. The enhancer derives these; every derived value surfaces as an editable control, never hidden. Explicit user values are echoed verbatim and never overridden — see `overrides` in the `/enhance` v2 contract (`shared/src/plan.ts`).

| Signal in the brief                                     | Derivation                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Icon / logo / avatar / sticker                          | square 1024; transparency likely → gpt-image-1.5; quality high for the final, low for drafts    |
| Cover / banner / hero / wallpaper                       | wide custom size (gpt-image-2 only); 2560×1440 for journal covers; quality low → high two-step  |
| Poster / portrait subject / phone                       | tall (1024×1536 or custom)                                                                      |
| Rendered text present                                   | quality ≥ medium; high for dense text                                                           |
| "draft / try / explore / variations"                    | quality low, n 2–6                                                                              |
| "final / print / ship"                                  | quality high, n 1                                                                               |
| Transparency ("transparent", "cutout", "no background") | background transparent → routes to gpt-image-1.5 (size snaps to presets)                        |
| Photoreal close-up portrait                             | quality high                                                                                    |
| Edit with identity/product fidelity concerns            | input_fidelity high (gpt-image-1.5 only — gpt-image-2 rejects the param and is high internally) |

The actual model-capability matrix (which model supports custom sizes / transparency / input*fidelity) is enforced by `shared/src/rules.ts`, not here — this table only describes what to \_derive*; `rules.ts` disposes.

## Cost anchors

Cost anchors (probe-measured, gpt-image-2 @ 1024×1024): low ≈ $0.006, high ≈ $0.211 per image; streaming preview costs a flat ~+$0.002 — default it on. Implemented as `estimateCost()` in `shared/src/cost.ts`, which scales these anchors linearly with pixel count relative to 1024×1024.
