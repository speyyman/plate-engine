import { clamp, hatch } from '../math.js'
import { defineGenerator } from './types.js'

/** The golden angle in degrees, 180 × (3 − √5) ≈ 137.508°. */
export const GOLDEN_ANGLE_DEG = 180 * (3 - Math.sqrt(5))

/**
 * Phyllotaxis: a sunflower head. Seed i sits at angle i × θ and radius c√i
 * (Vogel's model). At the golden angle the seeds pack without gaps; nudge the
 * angle and they collapse into spokes.
 */
export const phyllotaxis = defineGenerator({
  name: 'phyllotaxis',
  title: 'Phyllotaxis',
  description: 'A sunflower head: one angle between successive seeds, repeated a few hundred times.',
  params: {
    angle: {
      label: 'Divergence angle',
      description: 'Turn between one seed and the next, in degrees. The golden angle is about 137.508.',
      default: GOLDEN_ANGLE_DEG,
      min: 130,
      max: 145,
      step: 0.001,
    },
    count: { label: 'Seeds', description: 'Number of seeds in the head.', default: 620, min: 20, max: 3000, step: 10 },
    seedSize: {
      label: 'Seed size',
      description: 'Seed radius at the centre, relative to the spacing.',
      default: 0.42,
      min: 0.1,
      max: 0.9,
      step: 0.01,
    },
    petals: {
      label: 'Petals',
      description: 'Petals in the halo around the head.',
      default: 34,
      min: 0,
      max: 89,
      step: 1,
    },
  },
  draw(w, h, _rand, p) {
    const buf = new Float32Array(w * h)
    const cx = w * 0.5
    const cy = h * 0.5
    const R = Math.min(w, h) * 0.48
    // The default keeps the original radian expression so output matches bit for bit.
    const golden = p.angle === GOLDEN_ANGLE_DEG ? Math.PI * (3 - Math.sqrt(5)) : (p.angle * Math.PI) / 180
    const count = p.count
    const c = R / Math.sqrt(count)
    for (let i = 1; i < count; i++) {
      const a = i * golden
      const r = c * Math.sqrt(i)
      const sx = cx + Math.cos(a) * r
      const sy = cy + Math.sin(a) * r
      // Seeds grow toward the rim; each one is a tiny lit sphere.
      const rad = c * (p.seedSize + 0.2 * (r / R))
      const x0 = Math.max(0, Math.floor(sx - rad))
      const x1 = Math.min(w - 1, Math.ceil(sx + rad))
      const y0 = Math.max(0, Math.floor(sy - rad))
      const y1 = Math.min(h - 1, Math.ceil(sy + rad))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - sx) / rad
          const dy = (y - sy) / rad
          const d2 = dx * dx + dy * dy
          if (d2 > 1) continue
          const lit = clamp(0.35 + Math.sqrt(1 - d2) * 0.55 - dx * 0.25 - dy * 0.3)
          const falloff = 0.55 + 0.45 * (r / R)
          buf[y * w + x] = Math.max(buf[y * w + x], lit * falloff)
        }
      }
    }
    // Petals, drawn as a soft engraved halo past the seeds.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx
        const dy = y - cy
        const r = Math.hypot(dx, dy) / R
        if (r < 1.0) continue
        const a = Math.atan2(dy, dx)
        const petal = Math.pow(0.5 + 0.5 * Math.cos(a * p.petals + Math.sin(r * 9) * 0.6), 3) * Math.exp(-(r - 1) * 4.5)
        buf[y * w + x] = clamp(petal * (0.55 + 0.45 * hatch(x, y, petal, a, 1.3)))
      }
    }
    return buf
  },
})
