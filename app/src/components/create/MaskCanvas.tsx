import { Button, Group, Slider, Stack, Text } from '@mantine/core'
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from 'react'

/** Inverts the mask canvas's alpha channel: painted (opaque) becomes transparent, per the edit API's mask semantics. */
function exportInvertedMask(sourceCanvas: HTMLCanvasElement): Promise<Blob> {
  const ctx = sourceCanvas.getContext('2d')
  if (!ctx) throw new Error('Mask canvas has no 2D context')
  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255 - (data[i] ?? 0)
  }
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = sourceCanvas.width
  exportCanvas.height = sourceCanvas.height
  const exportCtx = exportCanvas.getContext('2d')
  if (!exportCtx) throw new Error('Mask export canvas has no 2D context')
  exportCtx.putImageData(imageData, 0, 0)
  return new Promise((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to export mask as PNG'))
    }, 'image/png')
  })
}

function hasAnyPaint(imageData: ImageData): boolean {
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 0) !== 0) return true
  }
  return false
}

export type MaskCanvasHandle = {
  /** Returns the inverted-alpha mask PNG, or null when nothing has been painted. */
  exportMask: () => Promise<Blob | null>
}

export type MaskCanvasProps = {
  ref?: Ref<MaskCanvasHandle>
  imageUrl: string
  brushSize: number
  onBrushSizeChange: (value: number) => void
}

/**
 * Paints a soft inpainting mask over the primary (first) reference image. The canvas is sized to
 * the image's NATURAL pixel dimensions (backing store), scaled down only via CSS for display —
 * pointer coordinates are mapped back to natural pixels so the exported mask lines up exactly
 * with the reference image the gateway receives. Ported unchanged from the pre-merge Edit.tsx.
 */
export function MaskCanvas({ ref, imageUrl, brushSize, onBrushSizeChange }: MaskCanvasProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<ImageData[]>([])
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [hasPainted, setHasPainted] = useState(false)

  useEffect(() => {
    setNaturalSize(null)
    setHasPainted(false)
    historyRef.current = []
  }, [imageUrl])

  function handleImageLoad(): void {
    const img = imgRef.current
    if (!img) return
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  function pushHistory(): void {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (historyRef.current.length > 20) historyRef.current.shift()
  }

  function paintDot(point: { x: number; y: number }): void {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'rgba(220, 38, 38, 1)'
    ctx.beginPath()
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasPainted(true)
  }

  function paintLine(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = 'rgba(220, 38, 38, 1)'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    const point = pointFromEvent(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pushHistory()
    drawingRef.current = true
    lastPointRef.current = point
    paintDot(point)
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return
    const point = pointFromEvent(event)
    const last = lastPointRef.current
    if (!point || !last) return
    paintLine(last, point)
    lastPointRef.current = point
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleUndo(): void {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const previous = historyRef.current.pop()
    if (previous) {
      ctx.putImageData(previous, 0, 0)
      setHasPainted(hasAnyPaint(previous))
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasPainted(false)
    }
  }

  function handleClear(): void {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    pushHistory()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasPainted(false)
  }

  useImperativeHandle(ref, () => ({
    exportMask: async () => {
      const canvas = canvasRef.current
      if (!canvas || !hasPainted) return null
      return exportInvertedMask(canvas)
    },
  }))

  return (
    <Stack gap="xs">
      <div style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
        <img
          ref={imgRef}
          src={imageUrl}
          onLoad={handleImageLoad}
          alt="Primary reference — paint the region to edit"
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
        />
        {naturalSize && (
          <canvas
            ref={canvasRef}
            aria-label="Paint mask over the reference image"
            width={naturalSize.width}
            height={naturalSize.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0.45,
              cursor: 'crosshair',
              borderRadius: 8,
              touchAction: 'none',
            }}
          />
        )}
      </div>
      <Group gap="sm" align="center">
        <Text size="sm" c="dimmed">
          Brush size
        </Text>
        <Slider
          value={brushSize}
          onChange={onBrushSizeChange}
          min={5}
          max={150}
          style={{ width: 160 }}
        />
        <Button size="xs" variant="default" onClick={handleUndo}>
          Undo
        </Button>
        <Button size="xs" variant="default" onClick={handleClear} disabled={!hasPainted}>
          Clear
        </Button>
        {hasPainted && (
          <Text size="xs" c="dimmed">
            Painted area will be edited; everything else is preserved
          </Text>
        )}
      </Group>
    </Stack>
  )
}
