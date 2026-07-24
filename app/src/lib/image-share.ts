import { fetch } from '@tauri-apps/plugin-http'
import type { ServiceConnection } from './settings'

/**
 * Calls the private image-share layer's agent API (`~/SourceRoot/image-share`): ingest
 * (`POST /api/images`) and publish-to-CDN (`POST /api/publish`). Mirrors `gateway.ts`'s idiom —
 * `@tauri-apps/plugin-http`'s `fetch` so the tailnet-only host isn't subject to WKWebView CORS,
 * same error-normalizing wrapper, same "throw the server's own message on failure" parse helper.
 * Field names below (`file`, `dir`, `imageIds`, `prefix`) and response shapes are pinned against
 * `image-share/apps/api/src/routes/{ingest,publish}.ts` — not guessed from generic REST
 * conventions.
 */

export type ImageShareUploadResult = {
  id: number
  root: 'share'
  relPath: string
  adminFileUrl: string
}

export type ImageSharePublishResult = {
  published: { id: number; key: string; cdnUrl: string }[]
  skipped: { id: number; key: string; reason: string; cdnUrl?: string }[]
}

async function imageShareFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    throw new Error(
      `image-share request failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

/** Extracts a human-readable error message from a non-ok response body, which may be a JSON
 * envelope (`{message}`, from Elysia's default error body or validation errors) or plain text
 * (`status(400, '<string>')` from ingest constraints, `status(401, 'Unauthorized')` from the auth
 * guard). Returns undefined for an empty/whitespace-only body so the caller can fall back to the
 * status code. */
function extractErrorMessage(text: string): string | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined

  try {
    const json: unknown = JSON.parse(trimmed)
    if (typeof json === 'object' && json !== null && 'message' in json) {
      return String((json as { message: unknown }).message)
    }
  } catch {
    // Not JSON — fall through to the raw text below.
  }

  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed
}

/** Parses a response body as JSON, throwing the server's own error message rather than a bare
 * status code when one is present. Reads the body as text first — image-share's error responses
 * are often plain text, not JSON, and calling `.json()` on those throws a confusing SyntaxError
 * instead of surfacing the server's actual message. Exported purely so `image-share.test.ts` can
 * drive it directly against constructed `Response` objects, without a Tauri runtime. */
export async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(text) ?? `image-share request failed with status ${response.status}`,
    )
  }

  return JSON.parse(text) as T
}

/** Uploads one file to image-share's ingest path. Returns the numeric image id `/api/publish`
 * needs — image-share ids are integers (its `images.id` column), not the studio's string
 * generation ids. */
export async function uploadToImageShare(
  connection: ServiceConnection,
  file: File,
): Promise<ImageShareUploadResult> {
  const baseUrl = connection.baseUrl.replace(/\/+$/, '')
  const formData = new FormData()
  formData.append('file', file)

  const response = await imageShareFetch(`${baseUrl}/api/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${connection.token}` },
    body: formData,
  })

  return parseJson<ImageShareUploadResult>(response)
}

/** Publishes already-ingested image-share images to the public CDN under `img/<prefix>/...`.
 * The studio only ever uses the opaque `'gen'` prefix — readable prefixes (`fuji`/`blog`) are a
 * human curation concern outside this app. */
export async function publishToImageShare(
  connection: ServiceConnection,
  imageIds: number[],
  prefix: 'gen',
): Promise<ImageSharePublishResult> {
  const baseUrl = connection.baseUrl.replace(/\/+$/, '')

  const response = await imageShareFetch(`${baseUrl}/api/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${connection.token}`,
    },
    body: JSON.stringify({ imageIds, prefix }),
  })

  return parseJson<ImageSharePublishResult>(response)
}

/** Builds the `![]()` markdown embed for a published CDN URL, using an `rs:fit:800/f:jpg`
 * rendition (matches the `/img` skill's convention — a bounded, JPEG-normalized preview, not the
 * original bytes). Derives the key straight from the returned `cdnUrl` rather than re-deriving
 * image-share's B2 key format here, so this stays correct even if that format changes. */
export function cdnMarkdownEmbed(cdnUrl: string): string {
  const url = new URL(cdnUrl)
  return `![](${url.origin}/rs:fit:800/f:jpg${url.pathname})`
}

/** Extracts the short B2 key (no `img/` prefix, no CDN origin) from a `cdnUrl` for storing in the
 * sidecar's `published_key` — sufficient on its own to rebuild any imgproxy rendition URL later. */
export function shortKeyFromCdnUrl(cdnUrl: string): string {
  return new URL(cdnUrl).pathname.replace(/^\//, '')
}
