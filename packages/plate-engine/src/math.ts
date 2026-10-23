/** Shared drawing helpers for the generators. Internal; not part of the public API. */

import type { Rng } from './rng.js'

export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v)

export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Engraver's hatching: parallel lines whose weight follows the tone. */
export function hatch(x: number, y: number, tone: number, angle = 0.6, freq = 0.9): number {
  const d = x * Math.cos(angle) + y * Math.sin(angle)
  const line = 0.5 + 0.5 * Math.sin(d * freq)
  return smooth(1 - tone - 0.15, 1 - tone + 0.15, line)
}

/** Sparse star field for dark backgrounds. */
export function stars(buf: Float32Array, w: number, h: number, rand: Rng, density = 0.004): void {
  const n = Math.floor(w * h * density)
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand() * w)
    const y = Math.floor(rand() * h)
    buf[y * w + x] = Math.max(buf[y * w + x], 0.5 + rand() * 0.5)
  }
}

/** Plot a thick line into a buffer (max-blend). */
export function line(
  buf: Float32Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v: number,
  t: number,
): void {
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

/** Smooth value noise in 0..1, summed over four octaves. For mottled ground. */
export function fbm(rand: Rng): (x: number, y: number) => number {
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
