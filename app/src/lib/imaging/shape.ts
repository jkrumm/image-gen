/**
 * Shape masking for the icon canvas: a plain circle, or a rounded-rect corner in one of two
 * flavors.
 *
 * The Apple icon shape is NOT a superellipse — it's a G2-continuous piecewise cubic Bezier (4
 * straight edges + 4 corners, each corner built from 3 cubic Bezier curves plus a short straight
 * "kink" segment). Control-point constants are from Apple's own UIBezierPath
 * `bezierPathWithRoundedRect:cornerRadius:` implementation (paintcodeapp.com, "Code for iOS 7
 * rounded rectangles"). A superellipse is measurably the WORST cheap approximation — do not
 * "simplify" this back to `Math.pow`.
 */
import { createMask, setAlpha } from './pixel'
import type { AlphaMask } from './types'

export type ShapeSpec =
  | { kind: 'none' }
  | { kind: 'circle' }
  | { kind: 'appleSquircle'; radiusPct: number }
  | { kind: 'roundedRect'; radiusPct: number }

type CornerPoint = { p: number; q: number }

/** A corner's shape, expressed in a local (p, q) frame: p = distance inward from the nearer
 * vertical edge, q = distance inward from the nearer horizontal edge, both in units of the
 * corner radius. `L` is how far (in radius units) the curve extends before the edge goes
 * straight — 1 for a circular fillet, ~1.529 for the Apple curve (it reaches further than the
 * nominal radius). `boundaryP(qUnit)` returns the p threshold at a given q; a point is inside
 * the corner iff `p >= boundaryP(q)`. */
type CornerShape = { L: number; boundaryP: (qUnit: number) => number }

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function sampleCubic(
  p0: CornerPoint,
  c1: CornerPoint,
  c2: CornerPoint,
  p1: CornerPoint,
  steps: number,
  includeStart: boolean,
): CornerPoint[] {
  const points: CornerPoint[] = []
  const start = includeStart ? 0 : 1
  for (let i = start; i <= steps; i++) {
    const t = i / steps
    points.push({
      p: cubicAt(p0.p, c1.p, c2.p, p1.p, t),
      q: cubicAt(p0.q, c1.q, c2.q, p1.q, t),
    })
  }
  return points
}

const APPLE_L = 1.52866483

/** Flattens the Apple corner curve (unit radius) once at module load: 3 cubic Beziers + 1 short
 * line segment, walked in order from the tangent point on the top edge to the tangent point on
 * the side edge. Both p (decreasing) and q (increasing) are monotonic along the walk because the
 * source control polygon is monotonic in each coordinate (a standard Bezier property), so this
 * table is already sorted ascending by q — no post-sort needed. */
function buildAppleCornerTable(): CornerPoint[] {
  const steps = 24
  const seg1P0: CornerPoint = { p: 1.52866483, q: 0 }
  const seg1C1: CornerPoint = { p: 1.08849323, q: 0 }
  const seg1C2: CornerPoint = { p: 0.86840689, q: 0 }
  const seg1P1: CornerPoint = { p: 0.66993427, q: 0.065496 }
  const lineEnd: CornerPoint = { p: 0.63149399, q: 0.074911 }
  const seg2C1: CornerPoint = { p: 0.37282392, q: 0.16905899 }
  const seg2C2: CornerPoint = { p: 0.16906013, q: 0.37282401 }
  const seg2P1: CornerPoint = { p: 0.07491176, q: 0.63149399 }
  const seg3C1: CornerPoint = { p: 0, q: 0.86840701 }
  const seg3C2: CornerPoint = { p: 0, q: 1.08849299 }
  const seg3P1: CornerPoint = { p: 0, q: 1.52866483 }

  return [
    ...sampleCubic(seg1P0, seg1C1, seg1C2, seg1P1, steps, true),
    lineEnd,
    ...sampleCubic(lineEnd, seg2C1, seg2C2, seg2P1, steps, false),
    ...sampleCubic(seg2P1, seg3C1, seg3C2, seg3P1, steps, false),
  ]
}

const APPLE_CORNER_TABLE = buildAppleCornerTable()

function interpolateP(table: CornerPoint[], qUnit: number): number {
  const first = table[0]
  const last = table[table.length - 1]
  if (!first || !last) return 0
  if (qUnit <= first.q) return first.p
  if (qUnit >= last.q) return last.p

  let lo = 0
  let hi = table.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const point = table[mid]
    if (point && point.q < qUnit) lo = mid + 1
    else hi = mid
  }

  const upper = table[lo]
  const lower = table[Math.max(lo - 1, 0)]
  if (!upper || !lower || upper.q === lower.q) return upper?.p ?? 0
  const t = (qUnit - lower.q) / (upper.q - lower.q)
  return lower.p + t * (upper.p - lower.p)
}

/** Standard circular fillet: `(p-1)^2 + (q-1)^2 = 1` at unit radius. */
function circleBoundaryP(qUnit: number): number {
  const q = Math.min(Math.max(qUnit, 0), 1)
  const inner = Math.max(0, 1 - (q - 1) ** 2)
  return 1 - Math.sqrt(inner)
}

const APPLE_CORNER: CornerShape = {
  L: APPLE_L,
  boundaryP: (q) => interpolateP(APPLE_CORNER_TABLE, q),
}
const CIRCLE_CORNER: CornerShape = { L: 1, boundaryP: circleBoundaryP }

/** `side >= 3.0573299 * radius` (i.e. `2 * APPLE_L * radius`) is the canonical form; below that
 * the two corners on the same edge would overlap, so the radius is scaled down to fit. This is
 * also what keeps the degenerate small-side case from producing garbage. */
function clampCornerRadius(
  width: number,
  height: number,
  radiusPct: number,
  corner: CornerShape,
): number {
  const requested = radiusPct * Math.min(width, height)
  const limit = Math.min(width, height) / (2 * corner.L)
  return Math.min(requested, limit)
}

function insideCornerRect(
  xf: number,
  yf: number,
  width: number,
  height: number,
  radius: number,
  corner: CornerShape,
): boolean {
  if (xf < 0 || yf < 0 || xf > width || yf > height) return false
  if (radius <= 0) return true

  const extent = radius * corner.L
  const nearLeft = xf < extent
  const nearRight = xf > width - extent
  const nearTop = yf < extent
  const nearBottom = yf > height - extent

  if (!((nearLeft || nearRight) && (nearTop || nearBottom))) return true

  const p = nearLeft ? xf : width - xf
  const q = nearTop ? yf : height - yf
  return p / radius >= corner.boundaryP(q / radius)
}

function insideEllipse(xf: number, yf: number, width: number, height: number): boolean {
  const rx = width / 2
  const ry = height / 2
  const nx = (xf - rx) / rx
  const ny = (yf - ry) / ry
  return nx * nx + ny * ny <= 1
}

function buildInsideFn(
  width: number,
  height: number,
  spec: ShapeSpec,
): (xf: number, yf: number) => boolean {
  switch (spec.kind) {
    case 'none':
      return () => true
    case 'circle':
      return (xf, yf) => insideEllipse(xf, yf, width, height)
    case 'roundedRect': {
      const radius = clampCornerRadius(width, height, spec.radiusPct, CIRCLE_CORNER)
      return (xf, yf) => insideCornerRect(xf, yf, width, height, radius, CIRCLE_CORNER)
    }
    case 'appleSquircle': {
      const radius = clampCornerRadius(width, height, spec.radiusPct, APPLE_CORNER)
      return (xf, yf) => insideCornerRect(xf, yf, width, height, radius, APPLE_CORNER)
    }
  }
}

const SUPERSAMPLE_GRID = 4

function supersample(insideAt: (xf: number, yf: number) => boolean, x: number, y: number): number {
  let hits = 0
  for (let j = 0; j < SUPERSAMPLE_GRID; j++) {
    for (let i = 0; i < SUPERSAMPLE_GRID; i++) {
      const sx = x + (i + 0.5) / SUPERSAMPLE_GRID
      const sy = y + (j + 0.5) / SUPERSAMPLE_GRID
      if (insideAt(sx, sy)) hits++
    }
  }
  return Math.round((255 * hits) / (SUPERSAMPLE_GRID * SUPERSAMPLE_GRID))
}

/** Builds a shape mask over a `width x height` canvas. Antialiases only pixels whose 4 corners
 * disagree on in/out (~1% of pixels near a boundary) via 4x4 supersampling — the other ~99% are
 * trivially in or out, which is what keeps this from being ~16M `boundaryP` calls. */
export function shapeMask(width: number, height: number, spec: ShapeSpec): AlphaMask {
  const insideAt = buildInsideFn(width, height, spec)
  const mask = createMask(width, height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c00 = insideAt(x, y)
      const c10 = insideAt(x + 1, y)
      const c01 = insideAt(x, y + 1)
      const c11 = insideAt(x + 1, y + 1)

      if (c00 === c10 && c10 === c01 && c01 === c11) {
        setAlpha(mask, x, y, c00 ? 255 : 0)
        continue
      }

      setAlpha(mask, x, y, supersample(insideAt, x, y))
    }
  }

  return mask
}
