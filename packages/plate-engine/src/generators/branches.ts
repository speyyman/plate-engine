import { hatch, line } from '../math.js'
import { defineGenerator } from './types.js'

/** Recursive branching: one seed, a few rules, a crown above the soil and roots below. */
export const branches = defineGenerator({
  name: 'branches',
  title: 'Branches',
  description: 'A tree grown from one rule applied recursively: a crown above the soil line, roots below.',
  params: {
    depth: {
      label: 'Depth',
      description: 'Levels of branching in the crown. The roots get one fewer.',
      default: 9,
      min: 2,
      max: 12,
      step: 1,
    },
    spread: {
      label: 'Spread',
      description: 'Largest turn, in radians, between a branch and its parent.',
      default: 1.5,
      min: 0,
      max: 3,
      step: 0.05,
    },
    shrink: {
      label: 'Shrink',
      description: 'Shortest child length as a fraction of its parent (plus up to 0.14 at random).',
      default: 0.68,
      min: 0.4,
      max: 0.84,
      step: 0.01,
    },
    fork: {
      label: 'Three-way forks',
      description: 'Chance that a branch splits in three instead of two.',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.05,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf[y * w + x] = 0.06 * hatch(x, y, 0.3, 0.2, 0.9)
    const ground = h * 0.66
    const grow = (x: number, y: number, ang: number, len: number, depth: number, dir: 1 | -1) => {
      if (depth === 0 || len < 1.5) return
      const x1 = x + Math.cos(ang) * len
      const y1 = y + Math.sin(ang) * len * dir
      const shade = dir === 1 ? 0.55 : 0.95
      line(buf, w, h, x, y, x1, y1, shade, Math.max(1, depth * 0.55))
      const n = rand() < p.fork ? 3 : 2
      for (let i = 0; i < n; i++) {
        const spread = (rand() - 0.5) * p.spread
        grow(x1, y1, ang + spread, len * (p.shrink + rand() * 0.14), depth - 1, dir)
      }
    }
    const unit = Math.min(w, h)
    grow(w * 0.5, ground, -Math.PI / 2, unit * 0.12, p.depth, 1) // crown
    grow(w * 0.5, ground, -Math.PI / 2, unit * 0.07, p.depth - 1, -1) // roots
    // The soil line.
    for (let x = 0; x < w; x++) {
      const y = Math.round(ground + Math.sin(x * 0.07) * 1.2)
      if (y >= 0 && y < h) buf[y * w + x] = 0.7
    }
    return buf
  },
})
