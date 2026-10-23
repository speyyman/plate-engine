import { defineGenerator } from './types.js'

/** Stacked ridge lines, drawn back to front so each one hides what is behind it. */
export const ridges = defineGenerator({
  name: 'ridges',
  title: 'Ridges',
  description: 'Stacked ridge lines, drawn back to front so each one hides what is behind it.',
  params: {
    lines: { label: 'Lines', description: 'Number of ridge lines.', default: 26, min: 4, max: 80, step: 1 },
    height: {
      label: 'Peak height',
      description: 'Peak height, in multiples of the gap between lines.',
      default: 5,
      min: 0,
      max: 12,
      step: 0.1,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    const lines = p.lines
    const gap = h / (lines + 4)
    const seeds = Array.from({ length: lines }, () => rand() * 100)
    // Draw back to front; each ridge occludes what is behind it.
    const top = new Float32Array(w).fill(h)
    for (let i = lines - 1; i >= 0; i--) {
      const base = gap * (i + 3)
      for (let x = 0; x < w; x++) {
        const t = x / w
        const centre = Math.exp(-Math.pow((t - 0.5) * 3.2, 2))
        const noise =
          Math.sin(t * 23 + seeds[i]) * 0.5 +
          Math.sin(t * 57 + seeds[i] * 1.7) * 0.3 +
          Math.sin(t * 131 + seeds[i] * 2.3) * 0.2
        const peak = centre * (0.6 + 0.4 * noise) * gap * p.height
        const yLine = Math.floor(base - Math.max(0, peak))
        const from = Math.max(0, yLine)
        const to = Math.min(top[x], h)
        for (let y = from; y < to; y++) {
          const d = y - yLine
          buf[y * w + x] = d < 1.2 ? 0.95 : 0.04
        }
        top[x] = Math.min(top[x], from)
      }
    }
    return buf
  },
})
