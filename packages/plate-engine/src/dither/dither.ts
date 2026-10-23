import { assertPalette, palettes, type Palette } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { bayerMap, blueNoiseMap, type ThresholdMap } from './matrices.js'

/** Every dither method the engine implements. */
export const DITHER_METHODS = [
  'threshold',
  'bayer2',
  'bayer4',
  'bayer8',
  'blue-noise',
  'floyd-steinberg',
  'atkinson',
] as const

/**
 * - `threshold`: round each cell to the nearest tone (no dither).
 * - `bayer2`/`bayer4`/`bayer8`: ordered dither with a recursive Bayer matrix.
 * - `blue-noise`: ordered dither with a 64×64 void-and-cluster mask.
 * - `floyd-steinberg`: error diffusion to four neighbours (7, 3, 5, 1 sixteenths).
 * - `atkinson`: error diffusion of three quarters of the error to six neighbours.
 */
export type DitherMethod = (typeof DITHER_METHODS)[number]

/** Methods that work cell by cell from a threshold map (and so can run on the GPU). */
export const ORDERED_METHODS: readonly DitherMethod[] = ['threshold', 'bayer2', 'bayer4', 'bayer8', 'blue-noise']

export type DitherOptions = {
  /** Default `'bayer8'`. */
  method?: DitherMethod
  /** Number of output tones, 2 to 16. Default 3. */
  levels?: number
  /** Uniform noise of this amplitude added to every cell before quantising. Default 0. */
  grain?: number
  /** Seed for the grain and the develop noise. Default 3. */
  seed?: number
  /** 0..1: how far the image has "developed" out of dark noise. 1 is the full image. Default 1. */
  progress?: number
  /** Error diffusion only: alternate row direction to avoid diagonal drift. Default false. */
  serpentine?: boolean
}

/** The settings speyyman.github.io uses for every plate. */
export const SITE_PLATE = { method: 'bayer8', levels: 3, grain: 0.06, seed: 3 } as const satisfies DitherOptions

/** The threshold map behind an ordered method. `threshold` uses a single cell at 0.5. */
export function thresholdMapFor(method: DitherMethod): ThresholdMap {
  switch (method) {
    case 'threshold':
      return { size: 1, values: Float32Array.of(0.5) }
    case 'bayer2':
      return bayerMap(2)
    case 'bayer4':
      return bayerMap(4)
    case 'bayer8':
      return bayerMap(8)
    case 'blue-noise':
      return blueNoiseMap()
    default:
      throw new Error(`${method} is not an ordered method`)
  }
}

function checkLevels(levels: number) {
  if (!Number.isInteger(levels) || levels < 2 || levels > 16)
    throw new RangeError(`levels must be 2..16, got ${levels}`)
}

/**
 * Add grain and develop noise exactly as the site does: two draws from the
 * PRNG per cell, in raster order. Returns doubles so nothing is rounded early.
 */
function prepare(lum: ArrayLike<number>, n: number, grain: number, seed: number, progress: number): Float64Array {
  const v = new Float64Array(n)
  if (grain === 0 && progress === 1) {
    for (let i = 0; i < n; i++) v[i] = lum[i]
    return v
  }
  const rand = mulberry32(seed)
  for (let i = 0; i < n; i++) {
    let x = lum[i] + (rand() - 0.5) * grain
    x = x * progress + rand() * 0.35 * (1 - progress)
    v[i] = x
  }
  return v
}

/**
 * Quantise a luminance buffer (0 = dark, 1 = light) to `levels` tones.
 * Returns one tone index per cell, 0 (darkest) to `levels − 1`.
 */
export function dither(lum: ArrayLike<number>, width: number, height: number, opts: DitherOptions = {}): Uint8Array {
  const { method = 'bayer8', levels = 3, grain = 0, seed = 3, progress = 1, serpentine = false } = opts
  checkLevels(levels)
  const n = width * height
  if (lum.length < n) throw new RangeError(`luminance buffer has ${lum.length} cells, need ${n}`)
  const v = prepare(lum, n, grain, seed, progress)
  const out = new Uint8Array(n)
  const top = levels - 1

  if (method === 'floyd-steinberg' || method === 'atkinson') {
    const atk = method === 'atkinson'
    for (let y = 0; y < height; y++) {
      const rtl = serpentine && (y & 1) === 1
      for (let k = 0; k < width; k++) {
        const x = rtl ? width - 1 - k : k
        const dir = rtl ? -1 : 1
        const i = y * width + x
        const old = v[i]
        let q = Math.round(old * top)
        q = q < 0 ? 0 : q > top ? top : q
        out[i] = q
        const err = old - q / top
        const put = (dx: number, dy: number, f: number) => {
          const xx = x + dx * dir
          const yy = y + dy
          if (xx >= 0 && xx < width && yy < height) v[yy * width + xx] += err * f
        }
        if (atk) {
          const e = 1 / 8
          put(1, 0, e)
          put(2, 0, e)
          put(-1, 1, e)
          put(0, 1, e)
          put(1, 1, e)
          put(0, 2, e)
        } else {
          put(1, 0, 7 / 16)
          put(-1, 1, 3 / 16)
          put(0, 1, 5 / 16)
          put(1, 1, 1 / 16)
        }
      }
    }
    return out
  }

  const map = thresholdMapFor(method)
  const size = map.size
  const t = map.values
  const pow2 = (size & (size - 1)) === 0
  const mask = size - 1
  for (let y = 0; y < height; y++) {
    const row = (pow2 ? y & mask : y % size) * size
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const th = t[row + (pow2 ? x & mask : x % size)]
      // levels − 1 bands; within a band, the threshold decides between its two tones.
      const s = Math.min(Math.max(v[i], 0), 1) * top
      const base = Math.min(Math.floor(s), top - 1)
      out[i] = s - base > th ? base + 1 : base
    }
  }
  return out
}

/** Paint tone indices with a palette into RGBA bytes (alpha 255). */
export function toRGBA(indices: Uint8Array, palette: Palette, out?: Uint8ClampedArray): Uint8ClampedArray {
  const n = indices.length
  const d = out ?? new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const c = palette[indices[i]]
    if (!c) throw new RangeError(`tone ${indices[i]} has no colour in a ${palette.length}-colour palette`)
    const o = i * 4
    d[o] = c[0]
    d[o + 1] = c[1]
    d[o + 2] = c[2]
    d[o + 3] = 255
  }
  return d
}

/** An image as RGBA bytes, shaped like the DOM's `ImageData`. */
export type RGBAImage = { width: number; height: number; data: Uint8ClampedArray }

/** Options for {@link renderCPU}: dither options plus the palette (whose size sets the levels). */
export type RenderOptions = Omit<DitherOptions, 'levels'> & { palette?: Palette }

/**
 * Dither on the CPU and paint with a palette. Works anywhere JavaScript runs:
 * browsers, workers, Node. The number of tones is the palette's length.
 */
export function renderCPU(lum: ArrayLike<number>, width: number, height: number, opts: RenderOptions = {}): RGBAImage {
  const palette = opts.palette ?? palettes.herbarium
  assertPalette(palette)
  const idx = dither(lum, width, height, { ...opts, levels: palette.length })
  return { width, height, data: toRGBA(idx, palette) }
}

/**
 * The site's plate dither, bit for bit: 8×8 Bayer, three tones, grain 0.06,
 * seed 3. Same output as `ditherToImageData` in the speyyman.github.io source.
 */
export function ditherPlate(
  lum: ArrayLike<number>,
  width: number,
  height: number,
  opts: { palette?: Palette; progress?: number; grain?: number; seed?: number } = {},
): RGBAImage {
  return renderCPU(lum, width, height, {
    method: SITE_PLATE.method,
    palette: opts.palette ?? palettes.herbarium,
    progress: opts.progress ?? 1,
    grain: opts.grain ?? SITE_PLATE.grain,
    seed: opts.seed ?? SITE_PLATE.seed,
  })
}
