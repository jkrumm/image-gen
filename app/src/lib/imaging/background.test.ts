import { describe, expect, test } from 'bun:test'
import { backgroundAlpha, transparentFraction } from './background'
import { makeFlatBg, makeGlowIcon, makeSparkles } from './fixtures'
import { createImage, getAlpha, getRgba, setRgba } from './pixel'

const CORNERS = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width - 1, y: 0 },
  { x: 0, y: height - 1 },
  { x: width - 1, y: height - 1 },
]

/**
 * A near-white blob fully enclosed by a dark ring, on a near-white background — the shape of a
 * wizard's beard inside a dark icon, or a white star core inside a glow. The enclosed blob is
 * background-*colored* but not background-*reachable*.
 */
function makeEnclosedHighlight(): {
  img: ReturnType<typeof createImage>
  inside: { x: number; y: number }
} {
  const size = 64
  const img = createImage(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2
      const dy = y - size / 2
      const dist = Math.sqrt(dx * dx + dy * dy)
      // ring at 12..24 is near-black; inside it, the same near-white as the background.
      if (dist >= 12 && dist <= 24) setRgba(img, x, y, 10, 10, 20, 255)
      else setRgba(img, x, y, 253, 253, 253, 255)
    }
  }
  return { img, inside: { x: size / 2, y: size / 2 } }
}

describe('backgroundAlpha', () => {
  test('keeps a background-colored highlight that the subject encloses (reachability, not color)', () => {
    const { img, inside } = makeEnclosedHighlight()
    // Tolerance far above the enclosed blob's ΔE from the background — they are the SAME color, so
    // only connectivity can tell them apart. A per-pixel ΔE threshold clears both.
    const mask = backgroundAlpha(img, {
      seeds: CORNERS(img.width, img.height),
      tolerance: 20,
      softness: 5,
    })

    expect(getAlpha(mask, 0, 0)).toBe(0) // reachable background: cleared
    expect(getAlpha(mask, inside.x, inside.y)).toBe(255) // enclosed: kept, despite identical color
    expect(getAlpha(mask, img.width / 2, img.height / 2 - 18)).toBe(255) // the ring itself
  })

  test('clears a ~253-with-drift background: corners transparent, most of the image clears', () => {
    const img = makeFlatBg({ bgColor: [253, 253, 253], drift: 1 })
    const mask = backgroundAlpha(img, {
      seeds: CORNERS(img.width, img.height),
      tolerance: 5,
      softness: 3,
    })

    expect(getAlpha(mask, 0, 0)).toBe(0)
    expect(getAlpha(mask, img.width - 1, 0)).toBe(0)
    expect(getAlpha(mask, 0, img.height - 1)).toBe(0)
    expect(getAlpha(mask, img.width - 1, img.height - 1)).toBe(0)
    expect(transparentFraction(mask)).toBeGreaterThan(0.85)
  })

  test('regression guard: a hardcoded #FFFFFF exact matcher would clear ~0% of this background', () => {
    const img = makeFlatBg({ bgColor: [253, 253, 253], drift: 1 })
    let exactWhiteCount = 0
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const [r, g, b] = getRgba(img, x, y)
        if (r === 255 && g === 255 && b === 255) exactWhiteCount++
      }
    }
    // Nobody should later "simplify" seed sampling into an exact-white comparison — it clears
    // nothing on real gpt-image-2 output, which never hits pure #FFFFFF.
    expect(exactWhiteCount / (img.width * img.height)).toBeLessThan(0.01)
  })

  test('glow icon: alpha ramps monotonically across the falloff, strictly between 0 and 255 somewhere', () => {
    const img = makeGlowIcon()
    const mask = backgroundAlpha(img, {
      seeds: CORNERS(img.width, img.height),
      tolerance: 5,
      softness: 40,
    })

    const cx = Math.floor(img.width / 2)
    const cy = Math.floor(img.height / 2)
    const samples: number[] = []
    for (let x = cx; x < img.width; x++) {
      samples.push(getAlpha(mask, x, cy))
    }

    let sawPartial = false
    for (const value of samples) {
      if (value > 0 && value < 255) sawPartial = true
    }
    expect(sawPartial).toBe(true)

    // Monotonic non-increasing as we walk outward from the (foreground) center to the (background) edge.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i] as number).toBeLessThanOrEqual(samples[i - 1] as number)
    }
  })

  test('saturated disconnected sparkles are retained (far from the seed color in LAB)', () => {
    const img = makeSparkles({ count: 4, connected: false })
    const mask = backgroundAlpha(img, {
      seeds: CORNERS(img.width, img.height),
      tolerance: 5,
      softness: 3,
    })

    // Sparkles start at (4, 4), each a 2x2 block.
    expect(getAlpha(mask, 4, 4)).toBe(255)
    expect(getAlpha(mask, 5, 5)).toBe(255)
  })
})
