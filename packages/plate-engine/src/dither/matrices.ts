import { BLUE_NOISE_64_B64, BLUE_NOISE_SIZE } from './blue-noise-64.js'

/** A square threshold map: `size × size` thresholds in (0, 1), row-major. */
export type ThresholdMap = { readonly size: number; readonly values: Float32Array }

/**
 * The classic recursive Bayer index matrix of side `n` (a power of two from 2
 * to 64): M(2n) = [[4M, 4M + 2], [4M + 3, 4M + 1]], starting from [[0, 2], [3, 1]].
 * Returns raw indices 0..n²−1.
 */
export function bayerIndices(n: number): Uint16Array {
  if (!Number.isInteger(Math.log2(n)) || n < 2 || n > 64)
    throw new RangeError(`Bayer size must be 2, 4, 8, 16, 32 or 64, got ${n}`)
  let m = Uint16Array.of(0, 2, 3, 1)
  for (let s = 2; s < n; s *= 2) {
    const next = new Uint16Array(4 * s * s)
    const S = 2 * s
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = 4 * m[y * s + x]
        next[y * S + x] = v
        next[y * S + x + s] = v + 2
        next[(y + s) * S + x] = v + 3
        next[(y + s) * S + x + s] = v + 1
      }
    }
    m = next
  }
  return m
}

const cache = new Map<string, ThresholdMap>()

/** Bayer thresholds of side `n`, normalised to (0, 1) as (index + 0.5) / n². */
export function bayerMap(n: number): ThresholdMap {
  const key = `bayer${n}`
  let t = cache.get(key)
  if (!t) {
    const idx = bayerIndices(n)
    t = { size: n, values: Float32Array.from(idx, (v) => (v + 0.5) / (n * n)) }
    cache.set(key, t)
  }
  return t
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Ranks 0..4095 of the shipped 64×64 void-and-cluster mask. */
export function blueNoiseRanks(): Uint16Array {
  const bytes = decodeBase64(BLUE_NOISE_64_B64)
  const out = new Uint16Array(BLUE_NOISE_SIZE * BLUE_NOISE_SIZE)
  for (let i = 0; i < out.length; i++) out[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8)
  return out
}

/** The 64×64 blue-noise thresholds, normalised to (0, 1) as (rank + 0.5) / 4096. */
export function blueNoiseMap(): ThresholdMap {
  let t = cache.get('blue')
  if (!t) {
    const n = BLUE_NOISE_SIZE * BLUE_NOISE_SIZE
    t = { size: BLUE_NOISE_SIZE, values: Float32Array.from(blueNoiseRanks(), (v) => (v + 0.5) / n) }
    cache.set('blue', t)
  }
  return t
}
