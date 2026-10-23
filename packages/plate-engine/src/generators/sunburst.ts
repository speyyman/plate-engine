import { clamp, hatch, smooth, stars } from '../math.js'
import { defineGenerator } from './types.js'

/** A sun setting behind a hatched hill, with rays and a ring. */
export const sunburst = defineGenerator({
  name: 'sunburst',
  title: 'Sunburst',
  description: 'A sun setting behind a hatched hill, with rays, a halo ring and a few stars.',
  params: {
    rays: {
      label: 'Rays',
      description: 'Number of light rays around the disc.',
      default: 64,
      min: 4,
      max: 160,
      step: 1,
    },
    glow: {
      label: 'Glow falloff',
      description: 'How quickly the glow fades with distance. Higher is tighter.',
      default: 2.6,
      min: 0.5,
      max: 8,
      step: 0.1,
    },
    horizon: {
      label: 'Horizon',
      description: 'How far below the sun the hill starts, as a fraction of the short side.',
      default: 0.22,
      min: -0.3,
      max: 0.5,
      step: 0.01,
    },
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
    const cy = h * 0.58
    const R = Math.min(w, h)
    const rays = p.rays
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx
        const dy = y - cy
        const r = Math.hypot(dx, dy) / R
        const a = Math.atan2(dy, dx)
        const ray = Math.pow(0.5 + 0.5 * Math.cos(a * rays), 6)
        const glow = Math.exp(-r * p.glow)
        const disc = 1 - smooth(0.16, 0.175, r)
        const ring = Math.exp(-Math.pow((r - 0.24) * 60, 2)) * 0.8
        let v = glow * (0.25 + ray * 0.9) + ring
        v = Math.max(v, disc * (0.75 + 0.25 * hatch(x, y, 0.85, 0.2, 1.4)))
        // horizon: the sun sinks behind a dark hill of hatch lines
        const horizon = cy + R * p.horizon + Math.sin(x * 0.03) * 3
        if (y > horizon) v = 0.18 * hatch(x, y, 0.25, 0, 0.8)
        buf[y * w + x] = clamp(v)
      }
    }
    stars(buf, w, h, rand, p.stars)
    return buf
  },
})
