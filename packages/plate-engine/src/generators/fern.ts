import { clamp, hatch } from '../math.js'
import { defineGenerator } from './types.js'

// Round cumulative probabilities so 0.01 + 0.85 + 0.07 is exactly 0.93, as in Barnsley's table.
const cum = (v: number) => Math.round(v * 1e12) / 1e12

/**
 * Barnsley's fern: four affine maps chosen at random by the chaos game, iterated
 * until a plant appears. The probabilities decide how much ink each map gets;
 * the coefficients decide the shape.
 */
export const fern = defineGenerator({
  name: 'fern',
  title: 'Barnsley fern',
  description: 'Four affine rules applied at random, a few hundred thousand times, until a fern appears.',
  params: {
    stem: {
      label: 'Stem rule',
      description: 'Probability of the stem map, which squashes points onto the stalk.',
      default: 0.01,
      min: 0,
      max: 0.2,
      step: 0.005,
    },
    frond: {
      label: 'Frond rule',
      description: 'Probability of the main map, which copies the whole fern a little smaller and higher.',
      default: 0.85,
      min: 0.3,
      max: 0.95,
      step: 0.01,
    },
    left: {
      label: 'Left leaflet rule',
      description: 'Probability of the map that makes the lowest left leaflet. The right leaflet gets what is left.',
      default: 0.07,
      min: 0,
      max: 0.3,
      step: 0.01,
    },
    curl: {
      label: 'Curl',
      description: 'The shear term of the main map. Barnsley used 0.04; other values bend the frond.',
      default: 0.04,
      min: -0.1,
      max: 0.15,
      step: 0.005,
    },
    density: {
      label: 'Density',
      description: 'Iterations per cell. More iterations, darker and smoother ink.',
      default: 6,
      min: 0.5,
      max: 24,
      step: 0.5,
    },
    tilt: {
      label: 'Tilt',
      description: 'Rotation of the whole plant, in radians.',
      default: -0.18,
      min: -0.8,
      max: 0.8,
      step: 0.01,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    const hits = new Float32Array(w * h)
    const n = w * h * p.density
    const t1 = cum(p.stem)
    const t2 = cum(p.stem + p.frond)
    const t3 = cum(p.stem + p.frond + p.left)
    let x = 0
    let y = 0
    // Fit the fern's bounds (-2.18..2.66, 0..9.99) into the plate, slightly tilted.
    const s = Math.min(w / 6.2, h / 10.6)
    const tilt = p.tilt
    const ox = w * 0.5
    const oy = h * 0.97
    for (let i = 0; i < n; i++) {
      const r = rand()
      let nx: number
      let ny: number
      if (r < t1) {
        nx = 0
        ny = 0.16 * y
      } else if (r < t2) {
        nx = 0.85 * x + p.curl * y
        ny = -p.curl * x + 0.85 * y + 1.6
      } else if (r < t3) {
        nx = 0.2 * x - 0.26 * y
        ny = 0.23 * x + 0.22 * y + 1.6
      } else {
        nx = -0.15 * x + 0.28 * y
        ny = 0.26 * x + 0.24 * y + 0.44
      }
      x = nx
      y = ny
      const px = Math.floor(ox + (x * Math.cos(tilt) - (y - 5) * Math.sin(tilt)) * s)
      const py = Math.floor(oy - 5 * s - (x * Math.sin(tilt) + (y - 5) * Math.cos(tilt)) * s)
      if (px >= 0 && px < w && py >= 0 && py < h) hits[py * w + px]++
    }
    let max = 0
    for (let i = 0; i < hits.length; i++) max = Math.max(max, hits[i])
    const lmax = Math.log(1 + max)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = py * w + px
        const d = hits[i] > 0 ? Math.log(1 + hits[i]) / lmax : 0
        // Faint engraved paper behind the specimen.
        const paper = 0.07 * hatch(px, py, 0.35, 0.78, 1.1)
        buf[i] = clamp(Math.max(paper, Math.pow(d, 0.55) * 1.15))
      }
    }
    return buf
  },
})
