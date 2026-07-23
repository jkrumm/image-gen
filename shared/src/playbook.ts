import { PLAYBOOK } from './playbook.generated.js'

export { PLAYBOOK }

/**
 * Bumped whenever `shared/playbook/*.md` content changes in a way that
 * affects enhancer output — recorded on every sidecar's
 * `enhance.playbook_version` and echoed by `GET /` and `POST /enhance` so a
 * generation's doctrine version is always attributable. Integer string, no
 * semver (docs/concept.md §9 / user story #12).
 */
export const PLAYBOOK_VERSION = '4'

const CORE_SECTIONS = ['core', 'settings', 'policy'] as const

/**
 * Concatenates the always-on core sections (`core`, `settings`, `policy`)
 * with the given intent-specific playbook files, in that order, into one
 * enhancer system prompt.
 *
 * `intents` are `shared/playbook/` file keys (filename without `.md`) — the
 * caller owns mapping its own intent vocabulary onto file keys. Note this is
 * NOT a 1:1 mapping from `plan.ts`'s `Intent` values: the `icon` intent's
 * file is `icons` (plural); every other intent matches its filename. Throws
 * on an unknown key rather than silently shipping an incomplete system prompt.
 */
export function composePlaybookSystemPrompt(intents: string[] = []): string {
  const keys: readonly string[] = [...CORE_SECTIONS, ...intents]

  return keys
    .map((key) => {
      const content = PLAYBOOK[key]
      if (content === undefined) {
        throw new Error(`composePlaybookSystemPrompt: unknown playbook file "${key}"`)
      }
      return content
    })
    .join('\n\n---\n\n')
}
