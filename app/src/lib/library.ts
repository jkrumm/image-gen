import {
  editRequestSchema,
  generateRequestSchema,
  type EditRequestInput,
  type EditResponse,
  type GenerateRequestInput,
  type GenerateResponse,
} from '@image-gen/shared'
import { join, pictureDir } from '@tauri-apps/api/path'
import { warn as logWarn } from '@tauri-apps/plugin-log'
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import type { EditFiles } from './gateway'
import {
  generationMetadataSchema,
  type GenerationImageMeta,
  type GenerationMetadata,
} from './metadata'

/** Library root, relative to the OS Pictures directory: `~/Pictures/ImageGen/`. */
const ROOT = 'ImageGen'

/** A saved generation's parsed sidecar plus its library-relative directory (`ImageGen/<id>`). */
export type LibraryEntry = {
  metadata: GenerationMetadata
  dir: string
}

/** Extends the gateway request with app-only lineage — never sent to the gateway itself. */
export type SaveGenerationRequest = GenerateRequestInput & { parentId?: string }

/** Extends the gateway edit request with app-only lineage — never sent to the gateway itself. */
export type SaveEditRequest = EditRequestInput & { parentId?: string }

const pad = (n: number): string => String(n).padStart(2, '0')

/** Sortable, chronological, collision-resistant generation id: `YYYY-MM-DD_HH-mm-ss_xxxx`. */
export function newGenerationId(): string {
  const now = new Date()
  const stamp = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-')
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-')
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${stamp}_${time}_${suffix}`
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/** Maps an input `File`'s MIME type to the on-disk extension; unknown types fall back to jpeg. */
function extensionForMimeType(mimeType: string): 'png' | 'webp' | 'jpeg' {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpeg'
}

/** Mints a fresh id and creates its library directory. Shared by every save path. */
async function createGenerationDir(): Promise<{ id: string; dir: string }> {
  const id = newGenerationId()
  const dir = `${ROOT}/${id}`
  await mkdir(dir, { baseDir: BaseDirectory.Picture, recursive: true })
  return { id, dir }
}

/** Writes each generated image as `image-<n>.<ext>` and returns their sidecar metadata. */
async function writeOutputImages(
  dir: string,
  images: { b64_json: string; format: 'png' | 'webp' | 'jpeg' }[],
): Promise<GenerationImageMeta[]> {
  return Promise.all(
    images.map(async (image, index) => {
      const filename = `image-${index + 1}.${image.format}`
      await writeFile(`${dir}/${filename}`, base64ToBytes(image.b64_json), {
        baseDir: BaseDirectory.Picture,
      })
      return { filename, format: image.format }
    }),
  )
}

/** Writes an edit's input images (`input-<n>.<ext>`) and mask (`mask.png`), when present. */
async function writeInputFiles(
  dir: string,
  files: EditFiles,
): Promise<{ inputImages: GenerationImageMeta[]; mask?: GenerationImageMeta }> {
  const inputImages = await Promise.all(
    files.images.map(async (file, index) => {
      const format = extensionForMimeType(file.type)
      const filename = `input-${index + 1}.${format}`
      await writeFile(`${dir}/${filename}`, await fileToBytes(file), {
        baseDir: BaseDirectory.Picture,
      })
      return { filename, format }
    }),
  )

  if (!files.mask) return { inputImages }

  const filename = 'mask.png'
  await writeFile(`${dir}/${filename}`, await fileToBytes(files.mask), {
    baseDir: BaseDirectory.Picture,
  })
  return { inputImages, mask: { filename, format: 'png' as const } }
}

async function writeMetadataSidecar(dir: string, metadata: GenerationMetadata): Promise<void> {
  await writeTextFile(`${dir}/metadata.json`, JSON.stringify(metadata, null, 2), {
    baseDir: BaseDirectory.Picture,
  })
}

/**
 * Persists a generation to `~/Pictures/ImageGen/<id>/`: one file per image plus a
 * `metadata.json` sidecar. Returns the written metadata (including the freshly minted id).
 */
export async function saveGeneration(
  response: GenerateResponse,
  request: SaveGenerationRequest,
): Promise<GenerationMetadata> {
  const parsedRequest = generateRequestSchema.parse(request)
  const { id, dir } = await createGenerationDir()
  const images = await writeOutputImages(dir, response.images)

  const metadata = generationMetadataSchema.parse({
    id,
    created_at: new Date().toISOString(),
    kind: 'generate',
    prompt: parsedRequest.prompt,
    requested_model: response.requested_model,
    model: response.model,
    routed: response.routed,
    ...(response.routing_reason !== undefined ? { routing_reason: response.routing_reason } : {}),
    params: {
      size: response.size,
      quality: response.quality,
      background: response.background,
      output_format: images[0]?.format ?? parsedRequest.output_format,
      ...(parsedRequest.output_compression !== undefined
        ? { output_compression: parsedRequest.output_compression }
        : {}),
      n: images.length,
      moderation: parsedRequest.moderation,
    },
    images,
    usage: response.usage,
    cost: response.cost,
    latency_ms: response.latency_ms,
    ...(request.parentId !== undefined ? { parent_id: request.parentId } : {}),
  } satisfies GenerationMetadata)

  await writeMetadataSidecar(dir, metadata)

  return metadata
}

/**
 * Persists an edit to `~/Pictures/ImageGen/<id>/`: the same layout as `saveGeneration`
 * plus the input images and mask that produced it, for reproducibility and lineage.
 */
export async function saveEdit(
  response: EditResponse,
  request: SaveEditRequest,
  files: EditFiles,
): Promise<GenerationMetadata> {
  const parsedRequest = editRequestSchema.parse(request)
  const { id, dir } = await createGenerationDir()
  const images = await writeOutputImages(dir, response.images)
  const { inputImages, mask } = await writeInputFiles(dir, files)

  const metadata = generationMetadataSchema.parse({
    id,
    created_at: new Date().toISOString(),
    kind: 'edit',
    prompt: parsedRequest.prompt,
    requested_model: response.requested_model,
    model: response.model,
    routed: response.routed,
    ...(response.routing_reason !== undefined ? { routing_reason: response.routing_reason } : {}),
    params: {
      size: response.size,
      quality: response.quality,
      background: response.background,
      output_format: images[0]?.format ?? parsedRequest.output_format,
      ...(parsedRequest.output_compression !== undefined
        ? { output_compression: parsedRequest.output_compression }
        : {}),
      n: images.length,
      moderation: parsedRequest.moderation,
      ...(parsedRequest.input_fidelity !== undefined
        ? { input_fidelity: parsedRequest.input_fidelity }
        : {}),
    },
    images,
    ...(inputImages.length > 0 ? { input_images: inputImages } : {}),
    ...(mask !== undefined ? { mask } : {}),
    usage: response.usage,
    cost: response.cost,
    latency_ms: response.latency_ms,
    ...(request.parentId !== undefined ? { parent_id: request.parentId } : {}),
  } satisfies GenerationMetadata)

  await writeMetadataSidecar(dir, metadata)

  return metadata
}

/** Lists every saved generation, newest first. Invalid/unreadable sidecars are skipped and warned. */
export async function listGenerations(): Promise<LibraryEntry[]> {
  const rootExists = await exists(ROOT, { baseDir: BaseDirectory.Picture })
  if (!rootExists) return []

  const entries = await readDir(ROOT, { baseDir: BaseDirectory.Picture })
  const generations: LibraryEntry[] = []

  for (const entry of entries) {
    if (!entry.isDirectory) continue
    const dir = `${ROOT}/${entry.name}`

    try {
      const raw = await readTextFile(`${dir}/metadata.json`, { baseDir: BaseDirectory.Picture })
      const parsed = generationMetadataSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) {
        void logWarn(`Skipping invalid generation metadata at ${dir}: ${parsed.error.message}`)
        continue
      }
      generations.push({ metadata: parsed.data, dir })
    } catch (error) {
      void logWarn(`Skipping unreadable generation at ${dir}: ${String(error)}`)
    }
  }

  return generations.toSorted((a, b) => b.metadata.created_at.localeCompare(a.metadata.created_at))
}

/** Absolute filesystem path to a saved generation's file, for `convertFileSrc()`. */
export async function absolutePath(id: string, file: string): Promise<string> {
  const picturesDir = await pictureDir()
  return join(picturesDir, ROOT, id, file)
}
