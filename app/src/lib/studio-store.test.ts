/**
 * `studio-store.ts` calls `@tauri-apps/plugin-fs`, which throws outside a Tauri webview — there is
 * no Tauri runtime in `bun test` (the repo CLAUDE.md's validation-surface note: "anything touching
 * the Tauri runtime is unverified until someone runs the app"). These tests exercise the module's
 * actual read/write/default/skip-invalid behavior through the injectable `StudioFs` port instead
 * of the real Tauri adapter, using an in-memory fake — they prove the IO logic and JSON contracts,
 * NOT that the real Tauri fs calls (paths, `BaseDirectory.Picture`, permissions) work at runtime.
 */
import { describe, expect, test } from 'bun:test'
import { createStudioStore, type StudioFs } from './studio-store'

type FakeFs = StudioFs & { files: Map<string, string>; warnings: string[] }

function createFakeFs(): FakeFs {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const warnings: string[] = []

  function registerAncestors(path: string): void {
    const parts = path.split('/')
    let acc = ''
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc === '' ? parts[i]! : `${acc}/${parts[i]}`
      dirs.add(acc)
    }
  }

  return {
    files,
    warnings,
    exists: async (path) => files.has(path) || dirs.has(path),
    readTextFile: async (path) => {
      const contents = files.get(path)
      if (contents === undefined) throw new Error(`ENOENT: ${path}`)
      return contents
    },
    writeTextFile: async (path, contents) => {
      registerAncestors(path)
      files.set(path, contents)
    },
    mkdir: async (path) => {
      registerAncestors(path)
      dirs.add(path)
    },
    readDir: async (path) => {
      const prefix = `${path}/`
      const childNames = new Set<string>()
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) childNames.add(key.slice(prefix.length).split('/')[0]!)
      }
      for (const key of dirs) {
        if (key.startsWith(prefix)) childNames.add(key.slice(prefix.length).split('/')[0]!)
      }
      return [...childNames].map((name) => {
        const isDirectory = dirs.has(`${path}/${name}`)
        return { name, isDirectory, isFile: !isDirectory }
      })
    },
    warn: (message) => {
      warnings.push(message)
    },
  }
}

describe('studio-store — projects', () => {
  test('readProject returns undefined when the file is missing, not throw', async () => {
    const store = createStudioStore(createFakeFs())
    expect(await store.readProject('missing-project')).toBeUndefined()
  })

  test('saveProject then readProject round-trips, defaulting notes/anchor_ids', async () => {
    const store = createStudioStore(createFakeFs())
    await store.saveProject({
      slug: 'journal-2026',
      name: 'Journal 2026',
      notes: '',
      anchor_ids: [],
    })
    const read = await store.readProject('journal-2026')
    expect(read?.name).toBe('Journal 2026')
    expect(read?.notes).toBe('')
    expect(read?.anchor_ids).toEqual([])
  })

  test('listProjects returns an empty list when the projects directory does not exist', async () => {
    const store = createStudioStore(createFakeFs())
    expect(await store.listProjects()).toEqual([])
  })

  test('listProjects lists every saved project', async () => {
    const store = createStudioStore(createFakeFs())
    await store.saveProject({ slug: 'acme-site', name: 'Acme Site', notes: '', anchor_ids: [] })
    await store.saveProject({
      slug: 'journal-2026',
      name: 'Journal 2026',
      notes: '',
      anchor_ids: ['gen-1'],
    })
    const projects = await store.listProjects()
    expect(projects.map((p) => p.slug).toSorted()).toEqual(['acme-site', 'journal-2026'])
  })

  test('listProjects skips an invalid project file and warns, rather than throwing', async () => {
    const fs = createFakeFs()
    const store = createStudioStore(fs)
    await store.saveProject({ slug: 'valid', name: 'Valid', notes: '', anchor_ids: [] })
    fs.files.set('ImageGen/.imagegen/projects/broken.json', JSON.stringify({ name: 'no slug' }))
    const projects = await store.listProjects()
    expect(projects.map((p) => p.slug)).toEqual(['valid'])
    expect(fs.warnings).toHaveLength(1)
  })
})

describe('studio-store — style guides', () => {
  test('readStyleGuide returns undefined when the file is missing, not throw', async () => {
    const store = createStudioStore(createFakeFs())
    expect(await store.readStyleGuide('missing-style')).toBeUndefined()
  })

  test('saveStyleGuide round-trips style.json and creates refs/ and sources/', async () => {
    const fs = createFakeFs()
    const store = createStudioStore(fs)
    await store.saveStyleGuide({
      slug: 'acme-web',
      name: 'Acme Web',
      palette: [{ hex: '#1A2B3C', role: 'primary' }],
      vocabulary: [],
      prompt_fragment: 'confident geometric sans, sapphire and slate',
      avoid: [],
      reference_images: [],
    })
    const read = await store.readStyleGuide('acme-web')
    expect(read?.palette[0]?.hex).toBe('#1A2B3C')
    expect(await fs.exists('ImageGen/.imagegen/styles/acme-web/refs')).toBe(true)
    expect(await fs.exists('ImageGen/.imagegen/styles/acme-web/sources')).toBe(true)
  })

  test('listStyleGuides returns an empty list when the styles directory does not exist', async () => {
    const store = createStudioStore(createFakeFs())
    expect(await store.listStyleGuides()).toEqual([])
  })

  test('listStyleGuides lists every saved guide, skipping non-directory entries', async () => {
    const fs = createFakeFs()
    const store = createStudioStore(fs)
    await store.saveStyleGuide({
      slug: 'acme-web',
      name: 'Acme Web',
      palette: [],
      vocabulary: [],
      prompt_fragment: 'confident geometric sans',
      avoid: [],
      reference_images: [],
    })
    // A stray file directly under styles/ (not a style-guide directory) must not be treated as one.
    fs.files.set('ImageGen/.imagegen/styles/README.md', '# not a style guide')
    const guides = await store.listStyleGuides()
    expect(guides.map((g) => g.slug)).toEqual(['acme-web'])
  })
})

describe('studio-store — create draft', () => {
  test('readCreateDraft returns undefined when the file is missing, not throw', async () => {
    const store = createStudioStore(createFakeFs())
    expect(await store.readCreateDraft()).toBeUndefined()
  })

  test('writeCreateDraft then readCreateDraft round-trips an opaque blob verbatim', async () => {
    const store = createStudioStore(createFakeFs())
    const draft = { brief: 'a lighthouse at dusk', someFutureField: { nested: true } }
    await store.writeCreateDraft(draft)
    expect(await store.readCreateDraft()).toEqual(draft)
  })
})
