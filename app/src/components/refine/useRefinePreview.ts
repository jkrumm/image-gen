/** Drives the Refine workbench's live preview: downscales the loaded source to a ≤512px working
 * copy once, then crops it (cheap, stays on the main thread). The heavy stages — background
 * removal, mask cleanup, transform, shape, pad — run in a Web Worker (`refine.worker.ts`) so
 * dragging a slider never blocks the main thread, whatever JavaScriptCore's WKWebView performance
 * turns out to be. Latest-wins: a stale worker response (an older request that resolves after a
 * newer one was already posted) is dropped by requestId, and the last good preview stays on screen
 * while a new one computes — the canvas never flashes empty mid-drag. */
import { error as logError } from '@tauri-apps/plugin-log'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { clampRect, contentBounds, cropImage } from '../../lib/imaging/crop'
import { alphaChannelMask, at, createImage } from '../../lib/imaging/pixel'
import { resizeImage } from '../../lib/imaging/pad'
import type { Recipe } from '../../lib/imaging/recipe'
import type { AlphaMask, RgbaImage } from '../../lib/imaging/types'
import type { PreviewMode } from './RefineCanvas'
import type { RefineWorkerRequest, RefineWorkerResponse } from './refineWorkerProtocol'

const PREVIEW_MAX_EDGE = 512

function downscaleForPreview(src: RgbaImage): RgbaImage {
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(src.width, src.height))
  if (scale >= 1) return src
  const width = Math.max(1, Math.round(src.width * scale))
  const height = Math.max(1, Math.round(src.height * scale))
  return resizeImage(src, width, height)
}

/** Renders a mask as an opaque grayscale image — the "Mask" preview mode, the only way to
 * directly see what Tolerance/Softness/cleanup are doing to the alpha channel. Only worth building
 * while that mode is actually active — it's a 262k-iteration loop plus a 1MB allocation otherwise
 * wasted on every mask change. */
function maskToGrayscale(mask: AlphaMask): RgbaImage {
  const out = createImage(mask.width, mask.height)
  for (let i = 0; i < mask.data.length; i++) {
    const v = at(mask.data, i)
    const o = i * 4
    out.data[o] = v
    out.data[o + 1] = v
    out.data[o + 2] = v
    out.data[o + 3] = 255
  }
  return out
}

function resolveCropRect(img: RgbaImage, crop: Recipe['crop']) {
  if (crop.autoTrim) return contentBounds(alphaChannelMask(img))
  return crop.rect ?? { x: 0, y: 0, width: img.width, height: img.height }
}

export type RefinePreview = {
  /** The ≤512px working copy of the source image, before crop. Also what the "Original" preview
   * mode shows. */
  previewSrc: RgbaImage | null
  /** `previewSrc` after the crop stage — the image every later stage (and seed-pick fractions)
   * operates on. */
  croppedPreview: RgbaImage | null
  mask: AlphaMask | null
  /** `mask` rendered as an opaque grayscale image, for the "Mask" preview mode. */
  maskPreview: RgbaImage | null
  /** The fully composited preview (background removal + cleanup + transform + shape + pad
   * applied). */
  composed: RgbaImage | null
}

type WorkerResult = { mask: AlphaMask; composed: RgbaImage }

export function useRefinePreview(
  source: RgbaImage | null,
  recipe: Recipe,
  mode: PreviewMode,
): RefinePreview {
  // Keeps typing/dragging responsive: the worker post below trails the input by one paint
  // instead of firing on every keystroke.
  const deferredRecipe = useDeferredValue(recipe)

  const previewSrc = useMemo(() => (source ? downscaleForPreview(source) : null), [source])

  const croppedPreview = useMemo(() => {
    if (!previewSrc) return null
    if (!deferredRecipe.crop.enabled) return previewSrc
    const rect = resolveCropRect(previewSrc, deferredRecipe.crop)
    return cropImage(previewSrc, clampRect(rect, previewSrc.width, previewSrc.height))
  }, [previewSrc, deferredRecipe.crop])

  const workerRef = useRef<Worker | null>(null)
  const latestRequestIdRef = useRef(0)
  const nextRequestIdRef = useRef(0)
  const [result, setResult] = useState<WorkerResult | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./refine.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<RefineWorkerResponse>) => {
      const response = event.data
      // A stale in-flight result must never overwrite a newer one.
      if (response.requestId !== latestRequestIdRef.current) return
      if (!response.ok) {
        void logError(`refine preview worker failed: ${response.error}`)
        return
      }
      setResult({
        mask: {
          width: response.mask.width,
          height: response.mask.height,
          data: new Uint8ClampedArray(response.mask.buffer),
        },
        composed: {
          width: response.composed.width,
          height: response.composed.height,
          data: new Uint8ClampedArray(response.composed.buffer),
        },
      })
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!croppedPreview) {
      setResult(null)
      return
    }
    const worker = workerRef.current
    if (!worker) return

    const requestId = ++nextRequestIdRef.current
    latestRequestIdRef.current = requestId

    // Defensive copy: `croppedPreview` is still read directly on the main thread (e.g. seed-color
    // sampling in Refine.tsx), so its own buffer must never be transferred/detached — only this
    // dedicated copy's buffer is handed to the worker.
    const data = new Uint8ClampedArray(croppedPreview.data)
    const request: RefineWorkerRequest = {
      requestId,
      image: { width: croppedPreview.width, height: croppedPreview.height, buffer: data.buffer },
      recipe: deferredRecipe,
    }
    worker.postMessage(request, [request.image.buffer])
    // deferredRecipe.crop is deliberately excluded: the worker only reads background/maskCleanup/
    // transform/shape/pad — crop is already baked into croppedPreview.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [
    croppedPreview,
    deferredRecipe.background,
    deferredRecipe.maskCleanup,
    deferredRecipe.transform,
    deferredRecipe.shape,
    deferredRecipe.pad,
  ])

  const maskPreview = useMemo(() => {
    if (mode !== 'mask' || !result) return null
    return maskToGrayscale(result.mask)
  }, [mode, result])

  return {
    previewSrc,
    croppedPreview,
    mask: result?.mask ?? null,
    maskPreview,
    composed: result?.composed ?? null,
  }
}
