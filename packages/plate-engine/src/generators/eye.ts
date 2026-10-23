import { clamp, hatch, smooth } from '../math.js'
import { defineGenerator } from './types.js'

/** An engraved eye: almond lids, a fibrous iris, a catchlight. Uses no randomness. */
export const eye = defineGenerator({
  name: 'eye',
  title: 'Eye',
  description: 'An engraved eye with almond lids, a fibrous iris and a catchlight. Uses no randomness.',
  params: {
    iris: {
      label: 'Iris',
      description: 'Iris radius, relative to the eye.',
      default: 0.36,
      min: 0.2,
      max: 0.55,
      step: 0.01,
    },
    fibers: { label: 'Fibres', description: 'Radial fibres in the iris.', default: 48, min: 8, max: 120, step: 1 },
    pupil: {
      label: 'Pupil',
      description: 'Pupil radius, relative to the eye.',
      default: 0.13,
      min: 0.03,
      max: 0.3,
      step: 0.01,
    },
  },
  draw(w, h, _rand, p) {
    const buf = new Float32Array(w * h)
    const cx = w * 0.5
    const cy = h * 0.5
    const S = Math.min(w, h * 1.4) * 0.46
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / S
        const dy = (y - cy) / S
        // almond-shaped lids from two circle arcs
        const lid = 0.62 - Math.pow(Math.abs(dx), 1.8) * 0.62
        const inside = Math.abs(dy) < lid
        let v: number
        if (!inside) {
          const lidLine = Math.exp(-Math.pow((Math.abs(dy) - lid) * 40, 2))
          const brow = Math.exp(-Math.pow((dy + lid + 0.28 + dx * dx * 0.25) * 18, 2)) * smooth(1, 0.3, Math.abs(dx))
          v = Math.max(lidLine * 0.95, brow * 0.6, 0.12 * hatch(x, y, 0.3, -0.5, 0.9))
        } else {
          const r = Math.hypot(dx, dy)
          const a = Math.atan2(dy, dx)
          const sclera = 0.85 - smooth(0.2, 0.9, Math.abs(dx)) * 0.4
          const irisR = p.iris
          if (r < irisR) {
            const fibers = 0.5 + 0.5 * Math.sin(a * p.fibers + Math.sin(a * 7) * 2)
            const tone = 0.25 + 0.45 * fibers * smooth(0.12, irisR, r) + (1 - smooth(irisR - 0.04, irisR, r)) * 0
            v = tone * (1 - smooth(irisR - 0.03, irisR, r) * 0.7)
            if (r < p.pupil) v = 0
            // catchlight
            const c = Math.hypot(dx + 0.1, dy + 0.11)
            if (c < 0.06) v = 1
          } else {
            v = sclera * (0.7 + 0.3 * hatch(x, y, sclera, 0.3, 1.3))
            v *= 1 - Math.exp(-Math.pow((r - irisR) * 30, 2)) * 0.9
          }
          // upper lid casts a shadow
          v *= smooth(-lid, -lid + 0.18, dy) * 0.6 + 0.4
        }
        buf[y * w + x] = clamp(v)
      }
    }
    return buf
  },
})
