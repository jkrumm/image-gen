/** The wire protocol between `useRefinePreview.ts` (main thread) and `refine.worker.ts`. Split
 * into its own file — deliberately with NO runtime code, only types — so main-thread files can
 * import these types without pulling `refine.worker.ts` itself (and its WebWorker-only globals,
 * `self.postMessage`/`self.onmessage`) into their DOM-lib `tsc` project. See `tsconfig.worker.json`
 * for why the worker file needs a separate `lib` and is excluded from `tsconfig.app.json`. */
import type { Recipe } from '../../lib/imaging/recipe'

/** An `RgbaImage`/`AlphaMask`-shaped buffer for `postMessage` transfer — `buffer` is transferred,
 * never structured-cloned, so a 512x512 preview tick moves megabytes for free. */
export type WireImage = { width: number; height: number; buffer: ArrayBuffer }

export type RefineWorkerRequest = {
  /** Monotonically increasing per post; the response echoes it back so the main thread can drop a
   * stale result that arrives after a newer request was already posted (latest-wins). */
  requestId: number
  image: WireImage
  recipe: Recipe
}

export type RefineWorkerResponse =
  | { requestId: number; ok: true; mask: WireImage; composed: WireImage }
  | { requestId: number; ok: false; error: string }
