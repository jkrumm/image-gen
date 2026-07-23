/**
 * The ONLY Tauri fs surface for Refine exports: baked derivative PNGs under
 * `~/Pictures/ImageGen/<generationId>/derived/<relativePath>` plus the sidecar patch that records
 * them. Mirrors `library.ts`'s write helpers (same `BaseDirectory.Picture` root, same
 * mkdir-then-writeFile shape) without importing from it — `library.ts` doesn't export its `ROOT`
 * constant, and this module intentionally never touches `saveGeneration`/`saveEdit`/`listGenerations`.
 */
import { BaseDirectory, mkdir, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { Recipe } from './imaging/recipe'
import {
  generationMetadataSchema,
  migrateGenerationMetadata,
  type GenerationDerivative,
} from './metadata'

/** Library root, relative to the OS Pictures directory — mirrors `library.ts`'s `ROOT`. */
const ROOT = 'ImageGen'

function generationDir(generationId: string): string {
  return `${ROOT}/${generationId}`
}

function derivedDir(generationId: string): string {
  return `${generationDir(generationId)}/derived`
}

function parentOf(path: string): string {
  const lastSlash = path.lastIndexOf('/')
  return lastSlash === -1 ? path : path.slice(0, lastSlash)
}

/** Writes one baked PNG to `<generationId>/derived/<relativePath>`, creating every directory the
 * path needs (a preset like the macOS iconset nests files under `<name>.iconset/`). */
export async function writeDerivedPng(
  generationId: string,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const fullPath = `${derivedDir(generationId)}/${relativePath}`
  await mkdir(parentOf(fullPath), { baseDir: BaseDirectory.Picture, recursive: true })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  await writeFile(fullPath, bytes, { baseDir: BaseDirectory.Picture })
}

/** Appends one derivative record to a generation's `metadata.json` sidecar, preserving every
 * other field. Re-parses through the full schema so a corrupt sidecar fails loudly here rather
 * than silently writing bad data forward.
 *
 * Migrates first: schema 2 requires `schema: 2` with no default, and migration is read-time only
 * (it never rewrites disk), so a pre-schema-2 sidecar stays legacy until something re-saves it —
 * and this is one of those re-save paths. Parsing without migrating would throw the first time a
 * user refined any generation created before schema 2. Unlike `listGenerations()`, which
 * `safeParse`s and silently skips, this path throws, so the failure would surface as a broken
 * Refine export rather than a vanished library entry. */
export async function recordDerivative(
  generationId: string,
  derivative: GenerationDerivative,
): Promise<void> {
  const dir = generationDir(generationId)
  const raw = await readTextFile(`${dir}/metadata.json`, { baseDir: BaseDirectory.Picture })
  const metadata = generationMetadataSchema.parse(migrateGenerationMetadata(JSON.parse(raw)))
  const next = { ...metadata, derivatives: [...(metadata.derivatives ?? []), derivative] }
  await writeTextFile(`${dir}/metadata.json`, JSON.stringify(next, null, 2), {
    baseDir: BaseDirectory.Picture,
  })
}

/** Bakes-and-saves entry point a view needs: writes the PNG, then patches the sidecar. Callers
 * never touch `writeDerivedPng`/`recordDerivative` directly. */
export async function saveDerivative(
  generationId: string,
  relativePath: string,
  blob: Blob,
  size: { width: number; height: number },
  label?: string,
  recipe?: Recipe,
): Promise<GenerationDerivative> {
  await writeDerivedPng(generationId, relativePath, blob)
  const derivative: GenerationDerivative = {
    filename: relativePath,
    width: size.width,
    height: size.height,
    createdAt: new Date().toISOString(),
    ...(label !== undefined ? { label } : {}),
    ...(recipe !== undefined ? { recipe } : {}),
  }
  await recordDerivative(generationId, derivative)
  return derivative
}
