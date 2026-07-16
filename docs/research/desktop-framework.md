# Research: macOS Desktop Framework (July 2026)

Deep comparison for a macOS-only, personal image-generation studio app built by a solo TypeScript-first developer. **Decision: Tauri v2.**

## Ranked outcome

1. **Tauri v2** — chosen.
2. Electron — permanent fallback if Tauri causes friction.
3. Electrobun — architecturally attractive, disqualified by single-maintainer risk.
4. Deno Desktop — experimental, missing native file dialogs.
5. Swift/SwiftUI — months of velocity tax for a web-first dev.

## Why Tauri v2

- Stable since 2024-10, current line 2.9.x, 120+ plugins, externally audited, CrabNebula-backed — abandonment risk very low.
- Full React + Tailwind reuse (basalt-ui consumable), 3–15 MB bundles, 20–100 MB idle RAM.
- Official plugins cover everything this app needs without meaningful Rust: `tauri-plugin-fs`, `tauri-plugin-dialog` (native open/save + drag-drop), `tauri-plugin-http`, `tauri-plugin-updater`. Typical apps ship with <100 lines of Rust.
- Mature `.dmg`/`.app` packaging, signing, and notarization via the Tauri CLI.

### The one macOS caveat: WKWebView 60fps cap

On macOS 13–15, WKWebView caps `requestAnimationFrame` at 60fps regardless of ProMotion displays (WebKit bug 173434, open since 2017; Tauri closed [#13978](https://github.com/tauri-apps/tauri/issues/13978) as not-planned). Fix: [`tauri-plugin-macos-fps`](https://github.com/userFRM/tauri-plugin-macos-fps) (v0.1.0, 2026-03) toggles a private WebKit preference — one line in `main.rs`. Not App-Store-safe, fine for personal direct distribution. No-op on macOS 26+ where Apple removed the cap.

## Why not the others

**Electrobun** (v1.0 2026-02, ~7.3K stars): all-TS/Bun, ~14 MB, 4 KB bsdiff updates — the right ideas. But it is a solo project whose README explicitly disclaims any expectation of issue/PR review, and a documented May 2026 field report hit packaging "sharp edges" on every platform and retreated to Electron ("runtime minimalism is a false economy if you end up rebuilding the ecosystem yourself"). Re-evaluate in 18–24 months.

**Deno Desktop** (Deno 2.9, 2026-06-25): explicitly experimental; in-process bindings and framework auto-detection are genuinely novel, but **platform-native file dialogs did not exist as of late June 2026** — disqualifying for an image studio. ~68 MB WebView build. Re-evaluate in 2027.

**Swift/SwiftUI**: best native feel and performance, but a 2–4 month learning curve (Swift, Xcode, property wrappers, concurrency) vs. a weekend in web tech, and zero reuse of the existing design-system investment. Wrong trade-off for "move fast, ship an MVP."

**Electron** (v43, Chromium 150): maximum velocity and the only stack with zero WebView caveats, at 50–150 MB+ and 100–300 MB idle RAM — cosmetic for a personal app, which is why it stays the fallback rather than the pick: Tauri gets the same frontend stack with a far lighter footprint and the fps caveat has a one-line fix.

## Decision heuristic recorded for posterity

> Ship this weekend → Electron. Spend a weekend learning a bit of Rust for a 3 MB binary → Tauri v2. If Tauri friction exceeds ~a day, fall back to Electron and don't look back.

## Sources

- https://v2.tauri.app/blog/tauri-20
- https://github.com/userFRM/tauri-plugin-macos-fps
- https://github.com/blackboardsh/electrobun
- https://www.rickvanlieshout.com/posts/2026/wanted-electrobun-shipping-chose-electron
- https://docs.deno.com/runtime/desktop
- https://ankursethi.com/blog/deno-desktop
- https://www.digitalapplied.com/blog/desktop-apps-web-stack-tauri-electron-deno-wails-2026
- https://www.pkgpulse.com/guides/electron-vs-tauri-2026
