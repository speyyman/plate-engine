/**
 * Procedural stand-ins for the art plates. Each generator fills a
 * luminance buffer (0 = dark, 1 = light) at the plate's cell resolution.
 * They imitate engravings: hard light, fine hatching, lots of black.
 */

import { moonPhase } from '../lib/moon'

export type ProceduralName =
  | 'sunburst'
  | 'sphere'
  | 'orbits'
  | 'eye'
  | 'ridges'
  | 'medallion'
  | 'fern'
  | 'phyllotaxis'
  | 'branches'
  | 'chladni'
  | 'moon'

type Gen = (w: number, h: number, rand: () => number) => Float32Array

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Mulberry32: tiny seeded PRNG so plates look the same on every load. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Engraver's hatching: parallel lines whose weight follows the tone. */
function hatch(x: number, y: number, tone: number, angle = 0.6, freq = 0.9) {
  const d = x * Math.cos(angle) + y * Math.sin(angle)
  const line = 0.5 + 0.5 * Math.sin(d * freq)
  return smooth(1 - tone - 0.15, 1 - tone + 0.15, line)
}

/** Sparse star field for dark backgrounds. */
function stars(buf: Float32Array, w: number, h: number, rand: () => number, density = 0.004) {
  const n = Math.floor(w * h * density)
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand() * w)
    const y = Math.floor(rand() * h)
    buf[y * w + x] = Math.max(buf[y * w + x], 0.5 + rand() * 0.5)
  }
}

const sunburst: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  const cx = w * 0.5
  const cy = h * 0.58
  const R = Math.min(w, h)
  const rays = 64
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy) / R
      const a = Math.atan2(dy, dx)
      const ray = Math.pow(0.5 + 0.5 * Math.cos(a * rays), 6)
      const glow = Math.exp(-r * 2.6)
      const disc = 1 - smooth(0.16, 0.175, r)
      const ring = Math.exp(-Math.pow((r - 0.24) * 60, 2)) * 0.8
      let v = glow * (0.25 + ray * 0.9) + ring
      v = Math.max(v, disc * (0.75 + 0.25 * hatch(x, y, 0.85, 0.2, 1.4)))
      // horizon: the sun sinks behind a dark hill of hatch lines
      const horizon = cy + R * 0.22 + Math.sin(x * 0.03) * 3
      if (y > horizon) v = 0.18 * hatch(x, y, 0.25, 0, 0.8)
      buf[y * w + x] = clamp(v)
    }
  }
  stars(buf, w, h, rand, 0.002)
  return buf
}

const sphere: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  // On wide plates, push the sphere right so text can float on the left.
  const cx = w > h * 1.3 ? w * 0.68 : w * 0.52
  const cy = h * 0.5
  const R = Math.min(w, h) * 0.38
  // light from the upper left, slightly in front
  const L = [-0.55, -0.6, 0.58]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / R
      const ny = (y - cy) / R
      const d2 = nx * nx + ny * ny
      let v = 0
      if (d2 <= 1) {
        const nz = Math.sqrt(1 - d2)
        const lam = clamp(nx * L[0] + ny * L[1] + nz * L[2])
        const spec = Math.pow(lam, 28) * 0.6
        const tone = clamp(lam * 0.9 + spec)
        // meridians and parallels, engraved into the surface
        const lon = Math.atan2(nx, nz)
        const lat = Math.asin(clamp(ny, -1, 1))
        const grid =
          Math.max(
            Math.exp(-Math.pow(Math.sin(lon * 6) * 9, 2)),
            Math.exp(-Math.pow(Math.sin(lat * 6) * 9, 2)),
          ) * 0.35
        v = clamp(tone * (0.6 + 0.4 * hatch(x, y, tone, 0.9, 1.2)) - grid * (1 - tone) + grid * tone * 0.3)
        // soft rim light
        v += smooth(0.88, 1, Math.sqrt(d2)) * 0.15
      } else {
        // cast shadow on the ground and a faint halo
        const halo = Math.exp(-(Math.sqrt(d2) - 1) * 5) * 0.18
        const sx = (x - cx - R * 0.45) / (R * 1.1)
        const sy = (y - cy - R * 1.0) / (R * 0.22)
        const shadow = sx * sx + sy * sy < 1 ? 1 : 0
        v = shadow ? 0 : halo
      }
      buf[y * w + x] = clamp(v)
    }
  }
  stars(buf, w, h, rand, 0.003)
  return buf
}

const orbits: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  const cx = w * 0.5
  const cy = h * 0.5
  const R = Math.min(w, h) * 0.47
  const tilt = 0.42
  const rings = [0.18, 0.31, 0.46, 0.62, 0.8, 0.97]
  const bodies = rings.map((r) => ({ r, a: rand() * Math.PI * 2, s: 0.04 + rand() * 0.04 }))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / R
      const dy = (y - cy) / (R * tilt)
      const r = Math.hypot(dx, dy)
      // Only the nearest ring can be visible at this pixel.
      let near = 9
      for (const rr of rings) near = Math.min(near, Math.abs(r - rr))
      let v = near < 0.05 ? Math.exp(-Math.pow(near * 60, 2)) * 0.9 : 0
      // dotted grid like a star chart
      if (x % 12 === 0 && y % 12 === 0) v = Math.max(v, 0.35)
      // central sun
      const pr = Math.hypot(x - cx, y - cy) / R
      if (pr < 0.6) {
        v = Math.max(v, (1 - smooth(0.06, 0.075, pr)) * 0.95)
        v = Math.max(v, Math.exp(-pr * 9) * 0.6)
      }
      buf[y * w + x] = clamp(v)
    }
  }
  // Planets, drawn only inside their own bounding boxes.
  for (const b of bodies) {
    const bx = cx + Math.cos(b.a) * b.r * R
    const by = cy + Math.sin(b.a) * b.r * R * tilt
    const rad = b.s * R
    for (let y = Math.max(0, Math.floor(by - rad)); y <= Math.min(h - 1, Math.ceil(by + rad)); y++) {
      for (let x = Math.max(0, Math.floor(bx - rad)); x <= Math.min(w - 1, Math.ceil(bx + rad)); x++) {
        if (Math.hypot(x - bx, y - by) >= rad) continue
        const lit = clamp(0.5 - ((x - bx) / rad) * 0.6)
        buf[y * w + x] = clamp(lit * (0.5 + 0.5 * hatch(x, y, lit, 1.1, 1.6)))
      }
    }
  }
  stars(buf, w, h, rand, 0.004)
  return buf
}

const eye: Gen = (w, h) => {
  const buf = new Float32Array(w * h)
  const cx = w * 0.5
  const cy = h * 0.5
  const S = Math.min(w, h * 1.4) * 0.46
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / S
      const dy = (y - cy) / S
      // almond-shaped lids from two circle arcs
      const lid = 0.62 - Math.pow(Math.abs(dx), 1.8) * 0.62
      const inside = Math.abs(dy) < lid
      let v: number
      if (!inside) {
        const lidLine = Math.exp(-Math.pow((Math.abs(dy) - lid) * 40, 2))
        const brow = Math.exp(-Math.pow((dy + lid + 0.28 + dx * dx * 0.25) * 18, 2)) * smooth(1, 0.3, Math.abs(dx))
        v = Math.max(lidLine * 0.95, brow * 0.6, 0.12 * hatch(x, y, 0.3, -0.5, 0.9))
      } else {
        const r = Math.hypot(dx, dy)
        const a = Math.atan2(dy, dx)
        const sclera = 0.85 - smooth(0.2, 0.9, Math.abs(dx)) * 0.4
        const irisR = 0.36
        if (r < irisR) {
          const fibers = 0.5 + 0.5 * Math.sin(a * 48 + Math.sin(a * 7) * 2)
          const tone = 0.25 + 0.45 * fibers * smooth(0.12, irisR, r) + (1 - smooth(irisR - 0.04, irisR, r)) * 0
          v = tone * (1 - smooth(irisR - 0.03, irisR, r) * 0.7)
          if (r < 0.13) v = 0
          // catchlight
          const c = Math.hypot(dx + 0.1, dy + 0.11)
          if (c < 0.06) v = 1
        } else {
          v = sclera * (0.7 + 0.3 * hatch(x, y, sclera, 0.3, 1.3))
          v *= 1 - Math.exp(-Math.pow((r - irisR) * 30, 2)) * 0.9
        }
        // upper lid casts a shadow
        v *= smooth(-lid, -lid + 0.18, dy) * 0.6 + 0.4
      }
      buf[y * w + x] = clamp(v)
    }
  }
  return buf
}

const ridges: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  const lines = 26
  const gap = h / (lines + 4)
  const seeds = Array.from({ length: lines }, () => rand() * 100)
  // Draw back to front; each ridge occludes what is behind it.
  const top = new Float32Array(w).fill(h)
  for (let i = lines - 1; i >= 0; i--) {
    const base = gap * (i + 3)
    for (let x = 0; x < w; x++) {
      const t = x / w
      const centre = Math.exp(-Math.pow((t - 0.5) * 3.2, 2))
      const noise =
        Math.sin(t * 23 + seeds[i]) * 0.5 +
        Math.sin(t * 57 + seeds[i] * 1.7) * 0.3 +
        Math.sin(t * 131 + seeds[i] * 2.3) * 0.2
      const peak = centre * (0.6 + 0.4 * noise) * gap * 5
      const yLine = Math.floor(base - Math.max(0, peak))
      const from = Math.max(0, yLine)
      const to = Math.min(top[x], h)
      for (let y = from; y < to; y++) {
        const d = y - yLine
        buf[y * w + x] = d < 1.2 ? 0.95 : 0.04
      }
      top[x] = Math.min(top[x], from)
    }
  }
  return buf
}

const medallion: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  const cx = w * 0.5
  const cy = h * 0.5
  const R = Math.min(w, h) * 0.44
  const ticks = 72
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / R
      const dy = (y - cy) / R
      const r = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx)
      let v = 0
      if (r < 1) {
        // a coin lit from the left: bevelled rim, ticks, a star in the field
        const lit = clamp(0.55 - dx * 0.35 - dy * 0.25)
        const rim = smooth(0.86, 0.9, r) * (1 - smooth(0.97, 1, r))
        const tickBand = r > 0.74 && r < 0.84 ? Math.pow(0.5 + 0.5 * Math.cos(a * ticks), 8) : 0
        const inner = Math.exp(-Math.pow((r - 0.7) * 80, 2))
        const starArms = 8
        const star = Math.pow(Math.abs(Math.cos(a * (starArms / 2))), 20) * (1 - smooth(0.05, 0.55, r))
        const core = 1 - smooth(0.08, 0.1, r)
        v = 0.18 * lit * hatch(x, y, lit * 0.6, 0.8, 1.1)
        v = Math.max(v, rim * lit * 1.1, tickBand * 0.8, inner * 0.7, star * 0.95, core)
      } else {
        v = Math.exp(-(r - 1) * 14) * 0.15
      }
      buf[y * w + x] = clamp(v)
    }
  }
  stars(buf, w, h, rand, 0.002)
  return buf
}

/** Barnsley's fern: four affine rules, iterated until a plant appears. */
const fern: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  const hits = new Float32Array(w * h)
  const n = w * h * 6
  let x = 0
  let y = 0
  // Fit the fern's bounds (-2.18..2.66, 0..9.99) into the plate, slightly tilted.
  const s = Math.min(w / 6.2, h / 10.6)
  const tilt = -0.18
  const ox = w * 0.5
  const oy = h * 0.97
  for (let i = 0; i < n; i++) {
    const r = rand()
    let nx: number
    let ny: number
    if (r < 0.01) {
      nx = 0
      ny = 0.16 * y
    } else if (r < 0.86) {
      nx = 0.85 * x + 0.04 * y
      ny = -0.04 * x + 0.85 * y + 1.6
    } else if (r < 0.93) {
      nx = 0.2 * x - 0.26 * y
      ny = 0.23 * x + 0.22 * y + 1.6
    } else {
      nx = -0.15 * x + 0.28 * y
      ny = 0.26 * x + 0.24 * y + 0.44
    }
    x = nx
    y = ny
    const px = Math.floor(ox + (x * Math.cos(tilt) - (y - 5) * Math.sin(tilt)) * s)
    const py = Math.floor(oy - 5 * s - (x * Math.sin(tilt) + (y - 5) * Math.cos(tilt)) * s)
    if (px >= 0 && px < w && py >= 0 && py < h) hits[py * w + px]++
  }
  let max = 0
  for (let i = 0; i < hits.length; i++) max = Math.max(max, hits[i])
  const lmax = Math.log(1 + max)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px
      const d = hits[i] > 0 ? Math.log(1 + hits[i]) / lmax : 0
      // Faint engraved paper behind the specimen.
      const paper = 0.07 * hatch(px, py, 0.35, 0.78, 1.1)
      buf[i] = clamp(Math.max(paper, Math.pow(d, 0.55) * 1.15))
    }
  }
  return buf
}

/** Phyllotaxis: a sunflower head. One angle (137.5 degrees), repeated. */
const phyllotaxis: Gen = (w, h) => {
  const buf = new Float32Array(w * h)
  const cx = w * 0.5
  const cy = h * 0.5
  const R = Math.min(w, h) * 0.48
  const golden = Math.PI * (3 - Math.sqrt(5))
  const count = 620
  const c = R / Math.sqrt(count)
  for (let i = 1; i < count; i++) {
    const a = i * golden
    const r = c * Math.sqrt(i)
    const sx = cx + Math.cos(a) * r
    const sy = cy + Math.sin(a) * r
    // Seeds grow toward the rim; each one is a tiny lit sphere.
    const rad = c * (0.42 + 0.2 * (r / R))
    const x0 = Math.max(0, Math.floor(sx - rad))
    const x1 = Math.min(w - 1, Math.ceil(sx + rad))
    const y0 = Math.max(0, Math.floor(sy - rad))
    const y1 = Math.min(h - 1, Math.ceil(sy + rad))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - sx) / rad
        const dy = (y - sy) / rad
        const d2 = dx * dx + dy * dy
        if (d2 > 1) continue
        const lit = clamp(0.35 + Math.sqrt(1 - d2) * 0.55 - dx * 0.25 - dy * 0.3)
        const falloff = 0.55 + 0.45 * (r / R)
        buf[y * w + x] = Math.max(buf[y * w + x], lit * falloff)
      }
    }
  }
  // Petals, drawn as a soft engraved halo past the seeds.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy) / R
      if (r < 1.0) continue
      const a = Math.atan2(dy, dx)
      const petal = Math.pow(0.5 + 0.5 * Math.cos(a * 34 + Math.sin(r * 9) * 0.6), 3) * Math.exp(-(r - 1) * 4.5)
      buf[y * w + x] = clamp(petal * (0.55 + 0.45 * hatch(x, y, petal, a, 1.3)))
    }
  }
  return buf
}

/** Plot a thick line into a buffer (max-blend). */
function line(buf: Float32Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, v: number, t: number) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 1
  const r = Math.max(0.5, t / 2)
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps
    const y = y0 + ((y1 - y0) * i) / steps
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue
        const k = yy * w + xx
        buf[k] = Math.max(buf[k], v)
      }
    }
  }
}

/** Branching: one seed, a few rules, a lot of tangle. Roots below, crown above. */
const branches: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf[y * w + x] = 0.06 * hatch(x, y, 0.3, 0.2, 0.9)
  const ground = h * 0.66
  const grow = (x: number, y: number, ang: number, len: number, depth: number, dir: 1 | -1) => {
    if (depth === 0 || len < 1.5) return
    const x1 = x + Math.cos(ang) * len
    const y1 = y + Math.sin(ang) * len * dir
    const shade = dir === 1 ? 0.55 : 0.95
    line(buf, w, h, x, y, x1, y1, shade, Math.max(1, depth * 0.55))
    const n = rand() < 0.3 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const spread = (rand() - 0.5) * 1.5
      grow(x1, y1, ang + spread, len * (0.68 + rand() * 0.14), depth - 1, dir)
    }
  }
  const unit = Math.min(w, h)
  grow(w * 0.5, ground, -Math.PI / 2, unit * 0.12, 9, 1) // crown
  grow(w * 0.5, ground, -Math.PI / 2, unit * 0.07, 8, -1) // roots
  // The soil line.
  for (let x = 0; x < w; x++) {
    const y = Math.round(ground + Math.sin(x * 0.07) * 1.2)
    if (y >= 0 && y < h) buf[y * w + x] = 0.7
  }
  return buf
}

/**
 * A Chladni figure: sand on a square plate, bowed until it sings. The sand
 * runs off everything that moves and settles on the still (nodal) lines.
 * Two square-plate modes, one standing wave: cos(nπx)cos(mπy) − cos(mπx)cos(nπy).
 */
const chladni: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  // The canvas is taller than the frame (room for the parallax drift), so keep clear of the ends.
  const side = Math.min(w * 0.86, h * 0.7)
  const x0 = (w - side) / 2
  const y0 = (h - side) / 2
  const n = 4
  const m = 9
  const mode = (u: number, v: number) =>
    Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) - Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v)
  const bolt = side * 0.035
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x - x0) / side
      const v = (y - y0) / side
      const i = y * w + x
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        // A soft shadow under the plate, down and to the right.
        const su = (x - x0 - side * 0.03) / side
        const sv = (y - y0 - side * 0.04) / side
        buf[i] = su > 0 && su < 1 && sv > 0 && sv < 1 ? 0 : 0.04 * rand()
        continue
      }
      // Sand piles up where the plate is still and thins out with distance.
      const f = mode(u, v)
      const sand = Math.exp(-((f / 0.09) ** 2))
      let t = rand() < sand * 0.92 ? 0.75 + rand() * 0.25 : 0.14 * hatch(x, y, 0.3, 0.8, 1.6)
      if (rand() < 0.012) t = 0.7 // strays that never found a line
      // The plate's edge and the bolt it is clamped by.
      const edge = Math.min(u, v, 1 - u, 1 - v) * side
      if (edge < 1) t = 0.55
      const r = Math.hypot(x - (x0 + side / 2), y - (y0 + side / 2))
      if (r < bolt) t = r > bolt - 1.2 ? 0.8 : 0.05
      buf[i] = t
    }
  }
  return buf
}

/** Smooth value noise in 0..1, summed over octaves. For mottled ground. */
function fbm(rand: () => number) {
  const N = 64
  const grid = Float32Array.from({ length: N * N }, rand)
  const at = (x: number, y: number) => grid[(((y % N) + N) % N) * N + (((x % N) + N) % N)]
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx
    return a + (b - a) * sy
  }
  return (x: number, y: number) => {
    let v = 0
    let amp = 0.5
    for (let o = 0; o < 4; o++) {
      v += noise(x * 2 ** o, y * 2 ** o) * amp
      amp /= 2
    }
    return v / 0.9375
  }
}

/** The near side's seas, in disc units (x right, y down, north up). [x, y, rx, ry]. */
const MARIA: [number, number, number, number][] = [
  [-0.3, -0.4, 0.3, 0.25], // Imbrium
  [-0.6, -0.02, 0.28, 0.46], // Procellarum
  [0.17, -0.4, 0.17, 0.16], // Serenitatis
  [0.33, -0.12, 0.23, 0.18], // Tranquillitatis
  [0.68, -0.3, 0.11, 0.13], // Crisium
  [0.57, 0.15, 0.13, 0.2], // Fecunditatis
  [0.37, 0.31, 0.11, 0.1], // Nectaris
  [-0.15, 0.33, 0.19, 0.15], // Nubium
  [-0.46, 0.43, 0.11, 0.1], // Humorum
  [-0.05, -0.73, 0.44, 0.08], // Frigoris
  [0.02, -0.08, 0.13, 0.15], // Vaporum and Sinus Medii
]

/**
 * The moon, engraved after Hevelius, lit as it is right now: the plate reads
 * the current phase, so a crescent week shows a crescent. Seas, craters with
 * rims, Tycho's rays, and earthshine on the dark side so the face stays legible.
 */
const moon: Gen = (w, h, rand) => {
  const buf = new Float32Array(w * h)
  const wide = w > h * 1.3
  const cx = wide ? w * 0.64 : w * 0.5
  // On narrow screens the log overlaps the bottom of the plate, so the moon rides higher.
  const cy = wide ? h * 0.5 : h * 0.42
  // Sized to the visible window, not the taller drifting canvas.
  const R = Math.min(w * 0.42, h * 0.36)
  const ground = fbm(rand)
  // Where the sun is, from the phase: behind the moon at new, behind us at full.
  const e = moonPhase(Date.now()).phase * Math.PI * 2
  const sun = [Math.sin(e), 0, -Math.cos(e)]

  // Craters: a few named ones, and a scatter whose sizes follow a steep power law.
  const craters: [number, number, number][] = [
    [-0.13, 0.7, 0.05], // Tycho
    [-0.33, -0.17, 0.055], // Copernicus
    [-0.6, -0.13, 0.03], // Kepler
    [-0.1, -0.8, 0.05], // Plato
    [-0.68, -0.38, 0.022], // Aristarchus
    [0.0, 0.42, 0.06], // Ptolemaeus
  ]
  while (craters.length < 220) {
    const x = rand() * 2 - 1
    const y = rand() * 2 - 1
    if (x * x + y * y < 0.92) craters.push([x, y, 0.012 + 0.06 * rand() ** 3])
  }
  const tycho = craters[0]
  // Lumpy sea edges: each sea is an ellipse with a wobble around its rim.
  const wobble = MARIA.map(() => [rand() * 6, rand() * 6, 0.08 + rand() * 0.1])

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / R
      const ny = (y - cy) / R
      const d2 = nx * nx + ny * ny
      const i = y * w + x
      if (d2 > 1) {
        // A thin halo, and the stars (never in front of the dark limb).
        buf[i] = rand() < 0.003 ? 0.5 + rand() * 0.5 : Math.exp(-(Math.sqrt(d2) - 1) * 18) * 0.15
        continue
      }
      const nz = Math.sqrt(1 - d2)

      let sea = 0
      MARIA.forEach(([mx, my, rx, ry], k) => {
        const [p, q, amp] = wobble[k]
        const a = Math.atan2(ny - my, nx - mx)
        const r = Math.hypot((nx - mx) / rx, (ny - my) / ry)
        const edge = 1 + amp * Math.sin(a * 3 + p) + amp * 0.6 * Math.sin(a * 7 + q)
        sea = Math.max(sea, 1 - smooth(edge - 0.35, edge + 0.15, r))
      })
      // Mottled highlands, smoother seas.
      const mottle = ground(nx * 9 + 20, ny * 9 + 20)
      let albedo = 0.84 - sea * 0.36 + (mottle - 0.5) * (0.34 - sea * 0.18)

      // Craters bend the surface normal: a bowl inside, a raised rim around it.
      let gx = 0
      let gy = 0
      for (const [kx, ky, kr] of craters) {
        const dx = (nx - kx) / kr
        const dy = (ny - ky) / kr
        const q = Math.hypot(dx, dy)
        if (q > 1.4 || q === 0) continue
        const slope = q < 1 ? 2 * q : 0
        const rim = -2 * ((q - 1) / 0.13) * Math.exp(-(((q - 1) / 0.13) ** 2)) * 0.35 / 0.13
        const g = (slope + rim) * 0.32
        gx += (g * dx) / q
        gy += (g * dy) / q
        if (q < 1.15 && q > 0.9) albedo += 0.05
      }
      // Tycho's bright rays, fanned across the southern highlands.
      const tdx = nx - tycho[0]
      const tdy = ny - tycho[1]
      const td = Math.hypot(tdx, tdy)
      const ray = Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(tdy, tdx) * 9 + 1.3), 14)
      albedo += ray * Math.exp(-td * 2.2) * 0.25 * (td > 0.06 ? 1 : 0)

      // Tilt the normal by the crater slopes, then light it.
      let px = nx - gx
      let py = ny - gy
      let pz = nz
      const len = Math.hypot(px, py, pz)
      px /= len
      py /= len
      pz /= len
      const lam = px * sun[0] + py * sun[1] + pz * sun[2]
      const day = smooth(-0.03, 0.07, lam)
      // The engraver's light, from the upper left, keeps relief readable even at full moon.
      const relief = clamp(0.5 + (-gx * 0.7 - gy * 0.7) * 1.4, 0, 1)
      const lit = albedo * (0.72 + 0.28 * Math.sqrt(Math.max(lam, 0))) * (0.8 + 0.4 * relief)
      const earthshine = albedo * 0.11 * (0.85 + 0.3 * relief)
      let tone = clamp(lit * day + earthshine * (1 - day))
      tone = tone * (0.82 + 0.18 * hatch(x, y, tone, 0.9, 1.6))
      // An engraved outline around the whole disc, so the dark limb still has an edge.
      tone = Math.max(tone, Math.exp(-((((1 - Math.sqrt(d2)) * R) / 0.9) ** 2)) * 0.45)
      buf[i] = clamp(tone)
    }
  }
  return buf
}

const generators: Record<ProceduralName, Gen> = {
  sunburst,
  sphere,
  orbits,
  eye,
  ridges,
  medallion,
  fern,
  phyllotaxis,
  branches,
  chladni,
  moon,
}

export function isProcedural(src: string): src is ProceduralName {
  return src in generators
}

export function generate(name: ProceduralName, w: number, h: number, seed = 7) {
  return generators[name](w, h, seeded(seed))
}
