import { clamp, hatch, smooth, stars } from '../math.js'
import { defineGenerator } from './types.js'

/** A coin lit from the left: bevelled rim, ticks, a star in the field. */
export const medallion = defineGenerator({
  name: 'medallion',
  title: 'Medallion',
  description: 'A coin lit from the left, with a bevelled rim, a ring of ticks and a star in the field.',
  params: {
    ticks: { label: 'Ticks', description: 'Tick marks around the inner ring.', default: 72, min: 0, max: 180, step: 1 },
    arms: { label: 'Star arms', description: 'Arms of the star in the centre.', default: 8, min: 2, max: 24, step: 2 },
    stars: {
      label: 'Stars',
      description: 'Star density, as a fraction of cells.',
      default: 0.002,
      min: 0,
      max: 0.02,
      step: 0.001,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    const cx = w * 0.5
    const cy = h * 0.5
    const R = Math.min(w, h) * 0.44
    const ticks = p.ticks
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / R
        const dy = (y - cy) / R
        const r = Math.hypot(dx, dy)
        const a = Math.atan2(dy, dx)
        let v: number
        if (r < 1) {
          const lit = clamp(0.55 - dx * 0.35 - dy * 0.25)
          const rim = smooth(0.86, 0.9, r) * (1 - smooth(0.97, 1, r))
          const tickBand = r > 0.74 && r < 0.84 ? Math.pow(0.5 + 0.5 * Math.cos(a * ticks), 8) : 0
          const inner = Math.exp(-Math.pow((r - 0.7) * 80, 2))
          const starArms = p.arms
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
    stars(buf, w, h, rand, p.stars)
    return buf
  },
})
