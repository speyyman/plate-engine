import { hatch } from '../math.js'
import { defineGenerator } from './types.js'

/**
 * A Chladni figure: sand on a square plate, bowed until it sings. The sand runs
 * off everything that moves and settles on the still (nodal) lines. Two
 * square-plate modes, one standing wave: cos(nπx)cos(mπy) − cos(mπx)cos(nπy).
 */
export const chladni = defineGenerator({
  name: 'chladni',
  title: 'Chladni figure',
  description: 'Sand settled on the still lines of a vibrating square plate, from two superposed modes.',
  params: {
    n: { label: 'Mode n', description: 'First mode number.', default: 4, min: 1, max: 16, step: 1 },
    m: {
      label: 'Mode m',
      description: 'Second mode number. Equal n and m gives a blank plate.',
      default: 9,
      min: 1,
      max: 16,
      step: 1,
    },
    sand: {
      label: 'Sand spread',
      description: 'How far from a nodal line sand still settles.',
      default: 0.09,
      min: 0.01,
      max: 0.4,
      step: 0.01,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    // The canvas is taller than the frame (room for the parallax drift), so keep clear of the ends.
    const side = Math.min(w * 0.86, h * 0.7)
    const x0 = (w - side) / 2
    const y0 = (h - side) / 2
    const n = p.n
    const m = p.m
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
        const sand = Math.exp(-((f / p.sand) ** 2))
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
  },
})
