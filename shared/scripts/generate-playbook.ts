import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PLAYBOOK_DIR = join(here, '..', 'playbook')
const OUTPUT_FILE = join(here, '..', 'src', 'playbook.generated.ts')

/**
 * Reads every `.md` file in `shared/playbook/` into a `{ filename-without-ext:
 * content }` map. Exported (not just used by `main()` below) so
 * `playbook.test.ts` can assert the checked-in generated module is in sync
 * with the source markdown without duplicating this logic.
 */
export function buildPlaybookMap(): Record<string, string> {
  const files = readdirSync(PLAYBOOK_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()

  const map: Record<string, string> = {}
  for (const file of files) {
    const key = file.slice(0, -'.md'.length)
    map[key] = readFileSync(join(PLAYBOOK_DIR, file), 'utf8')
  }
  return map
}

function renderModule(map: Record<string, string>): string {
  const entries = Object.entries(map)
    .map(([key, content]) => `  ${JSON.stringify(key)}: ${JSON.stringify(content)},`)
    .join('\n')

  return (
    '// GENERATED FILE — do not edit by hand.\n' +
    '// Run `bun run generate:playbook` (from shared/) after editing shared/playbook/*.md.\n\n' +
    `export const PLAYBOOK: Record<string, string> = {\n${entries}\n}\n`
  )
}

function main(): void {
  const map = buildPlaybookMap()
  writeFileSync(OUTPUT_FILE, renderModule(map))
  console.log(`Wrote ${Object.keys(map).length} playbook entries to ${OUTPUT_FILE}`)
}

if (import.meta.main) {
  main()
}
