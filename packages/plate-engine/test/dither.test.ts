import { describe, expect, it } from 'vitest'
import {
  bayerIndices,
  blueNoiseRanks,
  DITHER_METHODS,
  dither,
  generate,
  grayPalette,
  palettes,
  renderCPU,
  thresholdMapFor,
  type DitherMethod,
} from '../src/index.js'

const ramp = (w: number, h: number) => Float32Array.from({ length: w * h }, (_, i) => (i % w) / (w - 1))
const flat = (w: number, h: number, v: number) => new Float32Array(w * h).fill(v)

describe('threshold maps', () => {
  it('bayer8 is the classic matrix the site hard-codes', () => {
    // First two rows of the site's BAYER8 table.
    expect(Array.from(bayerIndices(8).slice(0, 16))).toEqual([
      0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    ])
  })

  for (const n of [2, 4, 8, 16]) {
    it(`bayer${n} is a permutation of 0..${n * n - 1}`, () => {
      const idx = Array.from(bayerIndices(n)).sort((a, b) => a - b)
      expect(idx).toEqual(Array.from({ length: n * n }, (_, i) => i))
    })
  }

  it('the blue-noise mask is a permutation of 0..4095', () => {
    const r = Array.from(blueNoiseRanks()).sort((a, b) => a - b)
    expect(r).toEqual(Array.from({ length: 4096 }, (_, i) => i))
  })

  it('the blue-noise mask spreads its lightest cells apart (unlike white noise)', () => {
    // At 10% coverage, count 4-neighbour pairs that are both "on". Random placement gives
    // about 0.1 of neighbours on; a void-and-cluster mask should give far fewer.
    const ranks = blueNoiseRanks()
    const on = (x: number, y: number) => ranks[((y + 64) % 64) * 64 + ((x + 64) % 64)] < 410
    let pairs = 0
    let ones = 0
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (!on(x, y)) continue
        ones++
        if (on(x + 1, y)) pairs++
        if (on(x, y + 1)) pairs++
      }
    }
    expect(ones).toBe(410)
    expect(pairs / (2 * ones)).toBeLessThan(0.02)
  })

  it('ordered thresholds lie strictly inside (0, 1)', () => {
    for (const m of ['bayer2', 'bayer4', 'bayer8', 'blue-noise'] as DitherMethod[]) {
      const t = thresholdMapFor(m).values
      expect(Math.min(...t)).toBeGreaterThan(0)
      expect(Math.max(...t)).toBeLessThan(1)
    }
  })
})

describe('dither', () => {
  const W = 128
  const H = 32

  for (const method of DITHER_METHODS) {
    for (const levels of [2, 3, 4, 16]) {
      it(`${method} at ${levels} levels emits only valid tones and preserves mean tone on a ramp`, () => {
        const lum = ramp(W, H)
        const idx = dither(lum, W, H, { method, levels })
        let sum = 0
        for (const v of idx) {
          expect(v).toBeLessThan(levels)
          sum += v / (levels - 1)
        }
        const meanOut = sum / idx.length
        const meanIn = lum.reduce((a, b) => a + b, 0) / lum.length
        // Plain thresholding is allowed to drift; real dithers should track the input closely.
        expect(Math.abs(meanOut - meanIn)).toBeLessThan(method === 'threshold' ? 0.08 : 0.02)
      })
    }
  }

  it('uses every tone across a full ramp', () => {
    for (const method of DITHER_METHODS) {
      for (const levels of [2, 3, 4, 16]) {
        const idx = dither(ramp(256, 8), 256, 8, { method, levels })
        expect(new Set(idx).size, `${method} @ ${levels}`).toBe(levels)
      }
    }
  })

  it('maps pure black and white to the end tones', () => {
    for (const method of DITHER_METHODS) {
      expect(new Set(dither(flat(16, 16, 0), 16, 16, { method, levels: 4 }))).toEqual(new Set([0]))
      expect(new Set(dither(flat(16, 16, 1), 16, 16, { method, levels: 4 }))).toEqual(new Set([3]))
    }
  })

  it('reproduces a flat 50% grey as an even checkerboard with bayer2', () => {
    const idx = dither(flat(4, 4, 0.5), 4, 4, { method: 'bayer2', levels: 2 })
    expect(Array.from(idx)).toEqual([1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1])
  })

  it('error diffusion keeps a flat grey on average for any level count', () => {
    for (const method of ['floyd-steinberg', 'atkinson'] as DitherMethod[]) {
      for (const levels of [2, 3, 4]) {
        const v = 0.37
        const idx = dither(flat(64, 64, v), 64, 64, { method, levels })
        const mean = idx.reduce((a, b) => a + b / (levels - 1), 0) / idx.length
        // Atkinson diffuses only six eighths of the error by design, so it drifts more.
        expect(Math.abs(mean - v), `${method} @ ${levels}`).toBeLessThan(method === 'atkinson' ? 0.06 : 0.02)
      }
    }
  })

  it('serpentine scanning changes the pattern but not the average', () => {
    const lum = generate('sphere', 64, 64)
    const a = dither(lum, 64, 64, { method: 'floyd-steinberg', levels: 2 })
    const b = dither(lum, 64, 64, { method: 'floyd-steinberg', levels: 2, serpentine: true })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
    const mean = (x: Uint8Array) => x.reduce((s, v) => s + v, 0) / x.length
    expect(Math.abs(mean(a) - mean(b))).toBeLessThan(0.01)
  })

  it('is deterministic for a seed and differs across seeds when grain is on', () => {
    const lum = generate('fern', 48, 80)
    const a = dither(lum, 48, 80, { grain: 0.1, seed: 1 })
    const b = dither(lum, 48, 80, { grain: 0.1, seed: 1 })
    const c = dither(lum, 48, 80, { grain: 0.1, seed: 2 })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false)
  })

  it('rejects level counts outside 2..16', () => {
    expect(() => dither(flat(2, 2, 0.5), 2, 2, { levels: 1 })).toThrow(RangeError)
    expect(() => dither(flat(2, 2, 0.5), 2, 2, { levels: 17 })).toThrow(RangeError)
  })
})

describe('renderCPU', () => {
  it('paints only palette colours, with the palette size as the level count', () => {
    const lum = generate('moon', 80, 60, { params: { phase: 0.3 } })
    for (const palette of [palettes.oneBit, palettes.herbarium, palettes.handheld, grayPalette(16)]) {
      const img = renderCPU(lum, 80, 60, { palette, method: 'atkinson' })
      const allowed = new Set(palette.map((c) => c.join(',')))
      const seen = new Set<string>()
      for (let i = 0; i < img.data.length; i += 4) {
        const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`
        expect(allowed.has(key)).toBe(true)
        expect(img.data[i + 3]).toBe(255)
        seen.add(key)
      }
      expect(seen.size).toBeLessThanOrEqual(palette.length)
      expect(seen.size).toBeGreaterThan(1)
    }
  })
})
