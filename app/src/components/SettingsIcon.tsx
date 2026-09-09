import type { ReactNode } from 'react'

/**
 * The settings gear, as a real icon component rather than the `⚙` character: the literal glyph
 * renders as a color emoji in parts of the macOS font stack, ignores `currentColor`, and has no
 * box of its own to size.
 *
 * The box is declared here once and read from `--vx-space-icon-size` (basalt's icon-slot override
 * hook, `1rem` by default), so a call site never passes geometry and a framework `icon` slot can
 * retune it per tier — basalt-ui 1.26.0 § "Icons — one box, no call-site geometry".
 */
export function SettingsIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      style={{
        width: 'var(--vx-space-icon-size, 1rem)',
        height: 'var(--vx-space-icon-size, 1rem)',
      }}
    >
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 1.2v1.9M8 12.9v1.9M1.2 8h1.9M12.9 8h1.9M3.2 3.2l1.35 1.35M11.45 11.45l1.35 1.35M12.8 3.2l-1.35 1.35M4.55 11.45L3.2 12.8" />
    </svg>
  )
}
