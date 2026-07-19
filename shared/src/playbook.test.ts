import { describe, expect, test } from 'bun:test'
import { buildPlaybookMap } from '../scripts/generate-playbook.js'
import { composePlaybookSystemPrompt, PLAYBOOK } from './playbook.js'

describe('PLAYBOOK', () => {
  test('playbook.generated.ts is in sync with shared/playbook/*.md', () => {
    // Regenerate-and-compare: catches anyone editing the .md sources without
    // re-running `bun run generate:playbook`.
    expect(PLAYBOOK).toEqual(buildPlaybookMap())
  })
})

describe('composePlaybookSystemPrompt', () => {
  test('always leads with core, then settings, then policy', () => {
    const prompt = composePlaybookSystemPrompt()
    const coreIndex = prompt.indexOf(PLAYBOOK.core as string)
    const settingsIndex = prompt.indexOf(PLAYBOOK.settings as string)
    const policyIndex = prompt.indexOf(PLAYBOOK.policy as string)

    expect(coreIndex).toBe(0)
    expect(settingsIndex).toBeGreaterThan(coreIndex)
    expect(policyIndex).toBeGreaterThan(settingsIndex)
  })

  test('appends requested intent files after the core sections, in the given order', () => {
    const prompt = composePlaybookSystemPrompt(['icons', 'article'])
    const policyIndex = prompt.indexOf(PLAYBOOK.policy as string)
    const iconsIndex = prompt.indexOf(PLAYBOOK.icons as string)
    const articleIndex = prompt.indexOf(PLAYBOOK.article as string)

    expect(iconsIndex).toBeGreaterThan(policyIndex)
    expect(articleIndex).toBeGreaterThan(iconsIndex)
  })

  test('with no intents, only the core sections are included', () => {
    const prompt = composePlaybookSystemPrompt()
    expect(prompt).toBe([PLAYBOOK.core, PLAYBOOK.settings, PLAYBOOK.policy].join('\n\n---\n\n'))
  })

  test('throws for an unknown playbook file key', () => {
    expect(() => composePlaybookSystemPrompt(['not-a-real-file'])).toThrow()
  })
})
