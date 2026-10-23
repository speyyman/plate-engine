import { describe, expect, it } from 'vitest'
import {
  adjust,
  crop,
  defineGenerator,
  fitTo,
  generate,
  generators,
  GOLDEN_ANGLE_DEG,
  mulberry32,
  paletteFromHex,
  parseHex,
  phaseName,
  resolveParams,
  rgbaToLuminance,
  rotate,
  runGenerator,
  scaleNearest,
  toHex,
} from '../src/index.js'

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('generator interface', () => {
  it('every generator documents its params with a default inside its range', () => {
    for (const g of Object.values(generators)) {
      expect(g.title.length).toBeGreaterThan(0)
      expect(g.description.length).toBeGreaterThan(0)
      for (const [key, spec] of Object.entries(g.params)) {
        const def = typeof spec.default === 'function' ? spec.default() : spec.default
        expect(def, `${g.name}.${key}`).toBeGreaterThanOrEqual(spec.min)
        expect(def, `${g.name}.${key}`).toBeLessThanOrEqual(spec.max)
        expect(spec.step).toBeGreaterThan(0)
      }
    }
  })

  it('every generator fills its buffer with values in [0, 1]', () => {
    for (const name of Object.keys(generators) as (keyof typeof generators)[]) {
      const lum = generate(name, 40, 30)
      expect(lum.length).toBe(1200)
      for (const v of lum) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('resolveParams fills defaults and clamps to range', () => {
    const p = resolveParams(generators.chladni.params, { n: 99 })
    expect(p).toEqual({ n: 16, m: 9, sand: 0.09 })
  })

  it('changing a parameter changes the drawing', () => {
    const a = generate('phyllotaxis', 64, 64)
    const b = generate('phyllotaxis', 64, 64, { params: { angle: GOLDEN_ANGLE_DEG + 0.5 } })
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(false)
  })

  it('accepts a custom generator through the same interface', () => {
    const stripes = defineGenerator({
      name: 'stripes',
      title: 'Stripes',
      description: 'Vertical stripes.',
      params: {
        period: { label: 'Period', description: 'Cells per stripe pair.', default: 4, min: 2, max: 32, step: 1 },
      },
      draw: (w, h, _rng, p) =>
        Float32Array.from({ length: w * h }, (_, i) => ((i % w) % p.period < p.period / 2 ? 1 : 0)),
    })
    expect(Array.from(runGenerator(stripes, 8, 1))).toEqual([1, 1, 0, 0, 1, 1, 0, 0])
  })

  it('rejects non-integer sizes', () => {
    expect(() => generate('eye', 10.5, 10)).toThrow(RangeError)
  })
})

describe('palette helpers', () => {
  it('parses and formats hex colours', () => {
    expect(parseHex('#ff6b3d')).toEqual([255, 107, 61])
    expect(parseHex('abc')).toEqual([170, 187, 204])
    expect(parseHex('nope')).toBeNull()
    expect(toHex([20, 42, 31])).toBe('#142a1f')
    expect(() => paletteFromHex(['#000'])).toThrow(RangeError)
  })

  it('names phases to the nearest eighth', () => {
    expect(phaseName(0)).toBe('New moon')
    expect(phaseName(0.5)).toBe('Full moon')
    expect(phaseName(0.99)).toBe('New moon')
  })
})

describe('luminance and transforms', () => {
  it('converts RGBA with Rec. 709 weights and composites alpha over white', () => {
    const lum = rgbaToLuminance([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0], 3, 1)
    expect(lum[0]).toBeCloseTo(0.2126, 4)
    expect(lum[1]).toBeCloseTo(0.7152, 4)
    expect(lum[2]).toBe(1)
  })

  it('adjusts brightness, contrast, gamma and invert', () => {
    expect(Array.from(adjust([0.5], { contrast: 2 }))).toEqual([0.5])
    expect(adjust([0.25], { contrast: 2 })[0]).toBeCloseTo(0, 6)
    expect(adjust([0.5], { invert: true })[0]).toBeCloseTo(0.5, 6)
    expect(adjust([0.5], { gamma: 2 })[0]).toBeCloseTo(0.25, 6)
  })

  it('rotates by quarter turns and back', () => {
    const g = { data: Uint8Array.from([1, 2, 3, 4, 5, 6]), width: 3, height: 2 }
    const r1 = rotate(g, 1)
    expect([r1.width, r1.height]).toEqual([2, 3])
    expect(Array.from(r1.data)).toEqual([4, 1, 5, 2, 6, 3])
    expect(Array.from(rotate(r1, 3).data)).toEqual(Array.from(g.data))
    expect(Array.from(rotate(g, 2).data)).toEqual([6, 5, 4, 3, 2, 1])
  })

  it('scales by whole factors and fits into frames', () => {
    const g = { data: Uint8Array.from([1, 2, 3, 4]), width: 2, height: 2 }
    expect(Array.from(scaleNearest(g, 2).data)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4])
    const c = fitTo(g, 4, 2, 'contain', 9)
    expect(Array.from(c.data)).toEqual([9, 1, 2, 9, 9, 3, 4, 9])
    const v = fitTo(g, 2, 4, 'cover')
    expect(v.width * v.height).toBe(8)
  })

  it('crops a centred window', () => {
    const g = { data: Uint8Array.from({ length: 16 }, (_, i) => i), width: 4, height: 4 }
    expect(Array.from(crop(g, 2, 2).data)).toEqual([5, 6, 9, 10])
    expect(Array.from(crop(g, 2, 1, 0, 3).data)).toEqual([12, 13])
    expect(() => crop(g, 5, 1)).toThrow(RangeError)
  })
})
