import type { GenerateRequest } from '@image-gen/shared'

export type Preset = {
  id: string
  label: string
  description: string
  /** Applied on top of the current form state — never touches the prompt. */
  request: {
    model: GenerateRequest['model']
    size: string
    quality: GenerateRequest['quality']
    background: GenerateRequest['background']
  }
}

/**
 * Every preset sets `background` explicitly (even to "auto") so applying one is valid
 * regardless of whatever background was previously selected — none of these may combine
 * a custom size with transparency, since that's exactly the trap Task 1 closes.
 */
export const PRESETS: Preset[] = [
  {
    id: 'journal-cover',
    label: 'Journal cover',
    description: 'Widescreen custom size for a journal or blog header.',
    request: { model: 'gpt-image-2', size: '2560x1440', quality: 'high', background: 'auto' },
  },
  {
    id: 'app-icon',
    label: 'App icon',
    description: 'Square icon with a transparent background (routes to gpt-image-1.5).',
    request: { model: 'auto', size: '1024x1024', quality: 'high', background: 'transparent' },
  },
  {
    id: 'art',
    label: 'Art',
    description: 'Portrait canvas for standalone artwork.',
    request: { model: 'gpt-image-2', size: '1024x1536', quality: 'high', background: 'auto' },
  },
]
