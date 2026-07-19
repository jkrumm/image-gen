/** Runs the Refine pipeline's heavy stages (background removal, mask cleanup, transform, shape,
 * pad) off the main thread so dragging a slider never blocks the UI — this is the payoff for
 * keeping the imaging core pure and DOM-free. Talks to `useRefinePreview.ts` over the
 * `RefineWorkerRequest`/`RefineWorkerResponse` protocol (`refineWorkerProtocol.ts`, kept
 * runtime-free so main-thread files can import its types without pulling this file's
 * WebWorker-only globals into their DOM-lib type-check project — see `tsconfig.worker.json`).
 * ArrayBuffers are transferred both ways, never structured-cloned. */
import { buildPreview } from '../../lib/imaging/pipeline'
import type { AlphaMask, RgbaImage } from '../../lib/imaging/types'
import type { RefineWorkerRequest, RefineWorkerResponse, WireImage } from './refineWorkerProtocol'

function toRgbaImage(wire: WireImage): RgbaImage {
  return { width: wire.width, height: wire.height, data: new Uint8ClampedArray(wire.buffer) }
}

/** `new Uint8ClampedArray(typedArray)` copies into a fresh, exactly-sized `ArrayBuffer` — so the
 * transferred buffer never aliases the pipeline's own working buffers. */
function toWireImage(img: RgbaImage | AlphaMask): WireImage {
  const copy = new Uint8ClampedArray(img.data)
  return { width: img.width, height: img.height, buffer: copy.buffer }
}

self.onmessage = (event: MessageEvent<RefineWorkerRequest>) => {
  const { requestId, image, recipe } = event.data

  try {
    const img = toRgbaImage(image)
    const { mask, composed } = buildPreview(img, recipe)

    const maskWire = toWireImage(mask)
    const composedWire = toWireImage(composed)
    const response: RefineWorkerResponse = {
      requestId,
      ok: true,
      mask: maskWire,
      composed: composedWire,
    }
    self.postMessage(response, [maskWire.buffer, composedWire.buffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const response: RefineWorkerResponse = { requestId, ok: false, error: message }
    self.postMessage(response)
  }
}
