/**
 * Content fingerprint of the sources that determine what the built Mac app IS —
 * used to PROVE the app installed in /Applications was built from the working
 * tree you are currently looking at.
 *
 *     bun scripts/codesum.ts app/src shared/src ...      # the working tree
 *     cat /Applications/ImageGen.app/Contents/Resources/.codesum   # recorded at install time
 *
 * The two must print the same hash. If they don't, the app in your dock is
 * running code you no longer have, and anything you conclude from clicking
 * around in it is about a version that no longer exists.
 *
 * This is the desktop analogue of rb's container fingerprint (rb/scripts/codesum.ts),
 * and it exists for the same reason: a lifecycle target should PROVE its result
 * rather than offer a "rebuild harder" escape hatch you can pull instead of
 * diagnosing. A Tauri app has a staleness mode a container doesn't — the build
 * is slow enough (~10 min of cargo) that "I'll rebuild later" is tempting, and
 * a stale .app in /Applications looks exactly like a current one.
 *
 * Two deliberate differences from rb's version:
 *
 *  - Paths ARE part of the hash. rb hashes the unordered SET of content digests
 *    because the same tree lives at different paths on host and in container.
 *    Here both sides are computed from the same working tree, so including the
 *    relative path costs nothing and additionally catches a pure file rename.
 *  - Test files are excluded. They change the tree constantly and cannot change
 *    the built binary; hashing them would report staleness that isn't real, and
 *    an assertion that cries wolf gets ignored, which is worse than no assertion.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Everything that ends up compiled into the bundle. `.json` covers tauri.conf.json + capabilities/. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.rs', '.json', '.html', '.css', '.toml']

/** Generated or built output — never an input to the build. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'gen', 'dist'])

function isSource(name: string): boolean {
  if (name.includes('.test.')) return false
  return SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension))
}

function walk(directory: string, root: string, digests: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      walk(join(directory, entry.name), root, digests)
      continue
    }
    if (!isSource(entry.name)) continue
    hashFile(join(directory, entry.name), root, digests)
  }
}

function hashFile(path: string, root: string, digests: string[]): void {
  const content = createHash('md5').update(readFileSync(path)).digest('hex')
  digests.push(`${relative(root, path)}:${content}`)
}

function treeHash(roots: string[]): string {
  const digests: string[] = []

  for (const root of roots) {
    // Roots are given relative to the repo root, so hash paths relative to the repo
    // root too — that keeps the digest stable no matter where make was invoked from.
    if (statSync(root).isDirectory()) walk(root, '.', digests)
    else hashFile(root, '.', digests)
  }

  digests.sort()
  return createHash('md5').update(digests.join('')).digest('hex')
}

const roots = process.argv.slice(2)
if (roots.length === 0) {
  // oxlint-disable-next-line no-console -- this IS the CLI's output contract
  console.error('usage: bun scripts/codesum.ts <path> [<path>...]')
  process.exit(1)
}

// oxlint-disable-next-line no-console -- this IS the CLI's output contract: one hex digest on stdout
console.log(treeHash(roots))
