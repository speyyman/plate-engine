import { clamp, hatch, smooth, stars } from '../math.js'
import { defineGenerator } from './types.js'

/** An orrery seen at an angle: six rings, six planets, a dotted star-chart grid. */
export const orbits = defineGenerator({
  name: 'orbits',
  title: 'Orbits',
  description: 'An orrery seen at an angle: six rings, six planets and a dotted star-chart grid.',
  params: {
    tilt: {
      label: 'Tilt',
      description: 'How flattened the orbits look. 1 is seen from straight above.',
      default: 0.42,
      min: 0.1,
      max: 1,
      step: 0.01,
    },
    grid: {
      label: 'Grid spacing',
      description: 'Cells between the dots of the chart grid.',
      default: 12,
      min: 4,
      max: 48,
      step: 1,
    },
    stars: {
      label: 'Stars',
      description: 'Star density, as a fraction of cells.',
      default: 0.004,
      min: 0,
      max: 0.02,
      step: 0.001,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    const cx = w * 0.5
    const cy = h * 0.5
    const R = Math.min(w, h) * 0.47
    const tilt = p.tilt
    const rings = [0.18, 0.31, 0.46, 0.62, 0.8, 0.97]
    const bodies = rings.map((r) => ({ r, a: rand() * Math.PI * 2, s: 0.04 + rand() * 0.04 }))
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / R
        const dy = (y - cy) / (R * tilt)
        const r = Math.hypot(dx, dy)
        // Only the nearest ring can be visible at this pixel.
        let near = 9
        for (const rr of rings) near = Math.min(near, Math.abs(r - rr))
        let v = near < 0.05 ? Math.exp(-Math.pow(near * 60, 2)) * 0.9 : 0
        // dotted grid like a star chart
        if (x % p.grid === 0 && y % p.grid === 0) v = Math.max(v, 0.35)
        // central sun
        const pr = Math.hypot(x - cx, y - cy) / R
        if (pr < 0.6) {
          v = Math.max(v, (1 - smooth(0.06, 0.075, pr)) * 0.95)
          v = Math.max(v, Math.exp(-pr * 9) * 0.6)
        }
        buf[y * w + x] = clamp(v)
      }
    }
    // Planets, drawn only inside their own bounding boxes.
    for (const b of bodies) {
      const bx = cx + Math.cos(b.a) * b.r * R
      const by = cy + Math.sin(b.a) * b.r * R * tilt
      const rad = b.s * R
      for (let y = Math.max(0, Math.floor(by - rad)); y <= Math.min(h - 1, Math.ceil(by + rad)); y++) {
        for (let x = Math.max(0, Math.floor(bx - rad)); x <= Math.min(w - 1, Math.ceil(bx + rad)); x++) {
          if (Math.hypot(x - bx, y - by) >= rad) continue
          const lit = clamp(0.5 - ((x - bx) / rad) * 0.6)
          buf[y * w + x] = clamp(lit * (0.5 + 0.5 * hatch(x, y, lit, 1.1, 1.6)))
        }
      }
    }
    stars(buf, w, h, rand, p.stars)
    return buf
  },
})
