/**
 * CPU dither: luminance buffer -> tritone image with an 8x8 Bayer matrix.
 * Forest (shadows) -> moss (mid-tones) -> parchment (highlights).
 * This is the static render, and later the fallback when WebGL is missing.
 */

import { seeded } from './procedural'

// Classic 8x8 ordered-dither matrix, normalised to (0, 1).
const BAYER8 = (() => {
  const m = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30,
    54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
    61, 29, 53, 21,
  ]
  return Float32Array.from(m, (v) => (v + 0.5) / 64)
})()

type RGB = [number, number, number]
export type Palette = [dark: RGB, mid: RGB, light: RGB]

const FALLBACK: Palette = [
  [0x14, 0x2a, 0x1f],
  [0x4f, 0x7a, 0x5a],
  [0xec, 0xe4, 0xd0],
]

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

/** The three dither tones come from CSS (--dither-dark/mid/light), so colours live in one place. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el)
  const get = (name: string, i: number) => hexToRgb(cs.getPropertyValue(name)) ?? FALLBACK[i]
  return [get('--dither-dark', 0), get('--dither-mid', 1), get('--dither-light', 2)]
}

export type DitherOptions = {
  /** 0..1, how far the image has "developed". 1 = the full image. */
  progress?: number
  /** Amount of grain mixed in before thresholding. */
  grain?: number
  seed?: number
  palette?: Palette
}

export function ditherToImageData(lum: Float32Array, w: number, h: number, opts: DitherOptions = {}) {
  const { progress = 1, grain = 0.06, seed = 3, palette = FALLBACK } = opts
  const rand = seeded(seed)
  const out = new ImageData(w, h)
  const d = out.data
  const levels = palette
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const t = BAYER8[(y & 7) * 8 + (x & 7)]
      let v = lum[i] + (rand() - 0.5) * grain
      // Undeveloped: the image sinks into dark noise.
      v = v * progress + (rand() * 0.35) * (1 - progress)
      // Two thresholds over three colours.
      const s = Math.min(Math.max(v, 0), 1) * 2
      const base = Math.min(Math.floor(s), 1)
      const idx = s - base > t ? base + 1 : base
      const c = levels[idx]
      const o = i * 4
      d[o] = c[0]
      d[o + 1] = c[1]
      d[o + 2] = c[2]
      d[o + 3] = 255
    }
  }
  return out
}

/**
 * Draw an image into a w x h luminance buffer. 'cover' crops to fill, like
 * object-fit: cover. 'contain' fits the whole image with a margin that prints
 * as paper, so an engraving sits on the page like a real plate.
 */
export function imageToLuminance(img: HTMLImageElement, w: number, h: number, fit: 'cover' | 'contain' = 'cover') {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const scale =
    fit === 'cover'
      ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
      : Math.min(w / img.naturalWidth, h / img.naturalHeight) * 0.9
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = (w - dw) / 2
  const dy = (h - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
  // The cells the image actually covers; everything else is margin.
  const x0 = Math.max(0, Math.ceil(dx))
  const y0 = Math.max(0, Math.ceil(dy))
  const x1 = Math.min(w, Math.floor(dx + dw))
  const y1 = Math.min(h, Math.floor(dy + dh))
  const px = ctx.getImageData(0, 0, w, h).data
  const lum = new Float32Array(w * h).fill(1)
  const inside: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x
      const o = i * 4
      // Rec. 709 luma.
      lum[i] = (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255
      inside.push(lum[i])
    }
  }
  // Old scans have yellowed paper and grey ink. Stretch so the paper prints as
  // clean paper (most of an engraving is paper, so the 85th percentile is safe)
  // and the ink as ink. Fine lines average to grey at cell size, so the curve
  // leans dark to keep them reading as ink rather than a green wash.
  const sorted = Float32Array.from(inside).sort()
  const lo = sorted[Math.floor(sorted.length * 0.02)] ?? 0
  const hi = sorted[Math.floor(sorted.length * 0.85)] ?? 1
  const span = Math.max(hi - lo, 0.05)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x
      const l = Math.min(Math.max((lum[i] - lo) / span, 0), 1) ** 1.5
      lum[i] = l * l * (3 - 2 * l)
    }
  }
  return lum
}
