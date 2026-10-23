import { clamp, hatch, smooth, stars } from '../math.js'
import { defineGenerator } from './types.js'

/** An engraved globe lit from the upper left, with a cast shadow. */
export const sphere = defineGenerator({
  name: 'sphere',
  title: 'Sphere',
  description: 'An engraved globe lit from the upper left, with meridians, a cast shadow and stars.',
  params: {
    grid: {
      label: 'Grid lines',
      description: 'Meridians and parallels per half turn.',
      default: 6,
      min: 0,
      max: 16,
      step: 1,
    },
    specular: {
      label: 'Shine',
      description: 'Specular exponent. Higher is a smaller, sharper highlight.',
      default: 28,
      min: 2,
      max: 96,
      step: 1,
    },
    stars: {
      label: 'Stars',
      description: 'Star density, as a fraction of cells.',
      default: 0.003,
      min: 0,
      max: 0.02,
      step: 0.001,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    // On wide plates, push the sphere right so text can float on the left.
    const cx = w > h * 1.3 ? w * 0.68 : w * 0.52
    const cy = h * 0.5
    const R = Math.min(w, h) * 0.38
    // light from the upper left, slightly in front
    const L = [-0.55, -0.6, 0.58]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / R
        const ny = (y - cy) / R
        const d2 = nx * nx + ny * ny
        let v: number
        if (d2 <= 1) {
          const nz = Math.sqrt(1 - d2)
          const lam = clamp(nx * L[0] + ny * L[1] + nz * L[2])
          const spec = Math.pow(lam, p.specular) * 0.6
          const tone = clamp(lam * 0.9 + spec)
          // meridians and parallels, engraved into the surface
          const lon = Math.atan2(nx, nz)
          const lat = Math.asin(clamp(ny, -1, 1))
          const grid =
            Math.max(
              Math.exp(-Math.pow(Math.sin(lon * p.grid) * 9, 2)),
              Math.exp(-Math.pow(Math.sin(lat * p.grid) * 9, 2)),
            ) * 0.35
          v = clamp(tone * (0.6 + 0.4 * hatch(x, y, tone, 0.9, 1.2)) - grid * (1 - tone) + grid * tone * 0.3)
          // soft rim light
          v += smooth(0.88, 1, Math.sqrt(d2)) * 0.15
        } else {
          // cast shadow on the ground and a faint halo
          const halo = Math.exp(-(Math.sqrt(d2) - 1) * 5) * 0.18
          const sx = (x - cx - R * 0.45) / (R * 1.1)
          const sy = (y - cy - R * 1.0) / (R * 0.22)
          const shadow = sx * sx + sy * sy < 1 ? 1 : 0
          v = shadow ? 0 : halo
        }
        buf[y * w + x] = clamp(v)
      }
    }
    stars(buf, w, h, rand, p.stars)
    return buf
  },
})
