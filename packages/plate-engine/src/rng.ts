/** A function that returns a uniformly distributed number in [0, 1). */
export type Rng = () => number

/**
 * Mulberry32: a tiny, fast, seeded PRNG with a 32-bit state. The same seed
 * always yields the same sequence, so a plate looks the same on every load.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
