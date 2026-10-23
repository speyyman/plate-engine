/**
 * Golden tests: the library must produce exactly what the site produces.
 *
 * `fixtures/site-art` holds verbatim copies of the site's art code (see its
 * SOURCE.md for the commit). Every generator is run through both, at wide,
 * narrow and square sizes and two seeds, and the buffers must be identical.
 * The library's own output is also hashed and compared with golden-hashes.json,
 * so any later change to a generator shows up even if the fixture moves with it.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ditherPlate, generate, generators, moonPhase, type GeneratorName } from '../src/index.js'
import * as siteDither from './fixtures/site-art/art/dither'
import * as site from './fixtures/site-art/art/procedural'
import { moonPhase as siteMoonPhase } from './fixtures/site-art/lib/moon'

// The site's CPU dither builds a DOM ImageData; Node has none, so supply the same shape.
class ImageDataShim {
  data: Uint8ClampedArray
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}
;(globalThis as unknown as { ImageData: unknown }).ImageData ??= ImageDataShim

/** A fixed clock, so the site's moon (which reads Date.now()) is deterministic. */
const PINNED = Date.UTC(2026, 9, 23, 4, 0, 0)
const SIZES: [number, number][] = [
  [96, 64],
  [64, 96],
  [120, 120],
]
const SEEDS = [7, 42]
const NAMES = Object.keys(generators) as GeneratorName[]

const hashFile = fileURLToPath(new URL('./golden-hashes.json', import.meta.url))
const update = process.env.UPDATE_GOLDEN === '1'
const stored: Record<string, string> = existsSync(hashFile) ? JSON.parse(readFileSync(hashFile, 'utf8')) : {}
const fresh: Record<string, string> = {}

const sha = (buf: ArrayBufferView) =>
  createHash('sha256')
    .update(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    .digest('hex')

function libGenerate(name: GeneratorName, w: number, h: number, seed: number) {
  // The moon's phase defaults to "now"; pin it to the same instant the site sees.
  const params = name === 'moon' ? { phase: moonPhase(PINNED).phase } : {}
  return generate(name, w, h, { seed, params })
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(PINNED)
})

afterAll(() => {
  vi.useRealTimers()
  if (update) writeFileSync(hashFile, JSON.stringify(fresh, null, 2) + '\n')
})

describe('generators match the site bit for bit', () => {
  it('covers every generator the site has', () => {
    const siteNames = [
      'sunburst',
      'sphere',
      'orbits',
      'eye',
      'ridges',
      'medallion',
      'fern',
      'phyllotaxis',
      'branches',
      'chladni',
      'moon',
    ]
    for (const n of siteNames) expect(site.isProcedural(n)).toBe(true)
    expect([...NAMES].sort()).toEqual([...siteNames].sort())
  })

  for (const name of NAMES) {
    for (const [w, h] of SIZES) {
      for (const seed of SEEDS) {
        it(`${name} ${w}×${h} seed ${seed}`, () => {
          const ours = libGenerate(name, w, h, seed)
          const theirs = site.generate(name as site.ProceduralName, w, h, seed)
          expect(ours.length).toBe(w * h)
          // Exact equality of every float, not closeness.
          expect(Buffer.from(ours.buffer).equals(Buffer.from(theirs.buffer))).toBe(true)
          const key = `${name}/${w}x${h}/${seed}`
          fresh[key] = sha(ours)
          if (!update)
            expect(fresh[key], `${key} hash changed; rerun with UPDATE_GOLDEN=1 if intended`).toBe(stored[key])
        })
      }
    }
  }
})

describe('dither matches the site bit for bit', () => {
  for (const name of ['phyllotaxis', 'moon', 'chladni'] as GeneratorName[]) {
    for (const progress of [1, 0.4]) {
      it(`${name} at progress ${progress}`, () => {
        const [w, h] = [96, 64]
        const lum = libGenerate(name, w, h, 7)
        const ours = ditherPlate(lum, w, h, { progress })
        const theirs = siteDither.ditherToImageData(lum, w, h, { progress })
        expect(Buffer.from(ours.data).equals(Buffer.from(theirs.data))).toBe(true)
        const key = `dither/${name}/${progress}`
        fresh[key] = sha(ours.data)
        if (!update) expect(fresh[key]).toBe(stored[key])
      })
    }
  }
})

describe('moon phase matches the site', () => {
  it('agrees at many instants across a year', () => {
    for (let t = PINNED; t < PINNED + 365 * 86_400_000; t += 3.7 * 86_400_000) {
      const a = moonPhase(t)
      const b = siteMoonPhase(t)
      expect(a.phase).toBe(b.phase)
      expect(a.lit).toBe(b.lit)
      expect(a.km).toBe(b.km)
    }
  })

  it('finds a published full moon', () => {
    // timeanddate.com gives the January 2024 full moon as 2024-01-25 17:54 UTC; the phase there should be very close to 0.5.
    const p = moonPhase(Date.UTC(2024, 0, 25, 17, 54)).phase
    expect(Math.abs(p - 0.5)).toBeLessThan(0.002)
  })
})
