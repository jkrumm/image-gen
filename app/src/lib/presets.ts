import type { GenerateRequest } from '@image-gen/shared'

export type Preset = {
  id: string
  label: string
  description: string
  /** Applied on top of the current form state — never touches the prompt. */
  request: {
    size: string
    quality: GenerateRequest['quality']
    background: GenerateRequest['background']
  }
}

/**
 * Presets carry no `model`: the studio generates with gpt-image-2 only, so there is nothing to
 * choose. They also never request `background: 'transparent'` — gpt-image-2 has no alpha channel
 * and hard-400s on it, and no generatable model is left to reroute to. Every preset still sets
 * `background` explicitly so applying one is valid regardless of the previous selection.
 */
export const PRESETS: Preset[] = [
  {
    id: 'journal-cover',
    label: 'Journal cover',
    description: 'Widescreen custom size for a journal or blog header.',
    request: { size: '2560x1440', quality: 'high', background: 'auto' },
  },
  {
    id: 'app-icon',
    label: 'App icon',
    description: 'Square canvas for an icon — opaque, since transparency is unavailable.',
    request: { size: '1024x1024', quality: 'high', background: 'opaque' },
  },
  {
    id: 'art',
    label: 'Art',
    description: 'Portrait canvas for standalone artwork.',
    request: { size: '1024x1536', quality: 'high', background: 'auto' },
  },
]
