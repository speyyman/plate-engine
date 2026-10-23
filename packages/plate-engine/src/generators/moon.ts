import { moonPhase } from '../astro.js'
import { clamp, fbm, hatch, smooth } from '../math.js'
import { defineGenerator } from './types.js'

/** The near side's seas, in disc units (x right, y down, north up). [x, y, rx, ry]. */
const MARIA: [number, number, number, number][] = [
  [-0.3, -0.4, 0.3, 0.25], // Imbrium
  [-0.6, -0.02, 0.28, 0.46], // Procellarum
  [0.17, -0.4, 0.17, 0.16], // Serenitatis
  [0.33, -0.12, 0.23, 0.18], // Tranquillitatis
  [0.68, -0.3, 0.11, 0.13], // Crisium
  [0.57, 0.15, 0.13, 0.2], // Fecunditatis
  [0.37, 0.31, 0.11, 0.1], // Nectaris
  [-0.15, 0.33, 0.19, 0.15], // Nubium
  [-0.46, 0.43, 0.11, 0.1], // Humorum
  [-0.05, -0.73, 0.44, 0.08], // Frigoris
  [0.02, -0.08, 0.13, 0.15], // Vaporum and Sinus Medii
]

/**
 * The moon, engraved after Hevelius, lit for a given phase: seas, craters with
 * rims, Tycho's rays, and earthshine on the dark side so the face stays legible.
 * The phase defaults to the moon's phase at the moment of drawing; pass
 * `phase: moonPhase(date).phase` for a fixed date.
 */
export const moon = defineGenerator({
  name: 'moon',
  title: 'Moon',
  description: 'The near side of the moon with seas, craters and rays, lit for any phase (tonight by default).',
  params: {
    phase: {
      label: 'Phase',
      description: '0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. Defaults to the phase right now.',
      default: () => moonPhase(Date.now()).phase,
      min: 0,
      max: 0.999,
      step: 0.001,
    },
    craters: {
      label: 'Craters',
      description: 'Total craters, including the six named ones.',
      default: 220,
      min: 6,
      max: 600,
      step: 1,
    },
    earthshine: {
      label: 'Earthshine',
      description: 'Light reflected from Earth onto the dark side.',
      default: 0.11,
      min: 0,
      max: 0.4,
      step: 0.01,
    },
  },
  draw(w, h, rand, p) {
    const buf = new Float32Array(w * h)
    const wide = w > h * 1.3
    const cx = wide ? w * 0.64 : w * 0.5
    // On narrow plates the moon rides higher, leaving room below for text.
    const cy = wide ? h * 0.5 : h * 0.42
    const R = Math.min(w * 0.42, h * 0.36)
    const ground = fbm(rand)
    // Where the sun is, from the phase: behind the moon at new, behind us at full.
    const e = p.phase * Math.PI * 2
    const sun = [Math.sin(e), 0, -Math.cos(e)]

    // Craters: a few named ones, and a scatter whose sizes follow a steep power law.
    const craters: [number, number, number][] = [
      [-0.13, 0.7, 0.05], // Tycho
      [-0.33, -0.17, 0.055], // Copernicus
      [-0.6, -0.13, 0.03], // Kepler
      [-0.1, -0.8, 0.05], // Plato
      [-0.68, -0.38, 0.022], // Aristarchus
      [0.0, 0.42, 0.06], // Ptolemaeus
    ]
    while (craters.length < p.craters) {
      const x = rand() * 2 - 1
      const y = rand() * 2 - 1
      if (x * x + y * y < 0.92) craters.push([x, y, 0.012 + 0.06 * rand() ** 3])
    }
    const tycho = craters[0]
    // Lumpy sea edges: each sea is an ellipse with a wobble around its rim.
    const wobble = MARIA.map(() => [rand() * 6, rand() * 6, 0.08 + rand() * 0.1])

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / R
        const ny = (y - cy) / R
        const d2 = nx * nx + ny * ny
        const i = y * w + x
        if (d2 > 1) {
          // A thin halo, and the stars (never in front of the dark limb).
          buf[i] = rand() < 0.003 ? 0.5 + rand() * 0.5 : Math.exp(-(Math.sqrt(d2) - 1) * 18) * 0.15
          continue
        }
        const nz = Math.sqrt(1 - d2)

        let sea = 0
        MARIA.forEach(([mx, my, rx, ry], k) => {
          const [ph, q, amp] = wobble[k]
          const a = Math.atan2(ny - my, nx - mx)
          const r = Math.hypot((nx - mx) / rx, (ny - my) / ry)
          const edge = 1 + amp * Math.sin(a * 3 + ph) + amp * 0.6 * Math.sin(a * 7 + q)
          sea = Math.max(sea, 1 - smooth(edge - 0.35, edge + 0.15, r))
        })
        // Mottled highlands, smoother seas.
        const mottle = ground(nx * 9 + 20, ny * 9 + 20)
        let albedo = 0.84 - sea * 0.36 + (mottle - 0.5) * (0.34 - sea * 0.18)

        // Craters bend the surface normal: a bowl inside, a raised rim around it.
        let gx = 0
        let gy = 0
        for (const [kx, ky, kr] of craters) {
          const dx = (nx - kx) / kr
          const dy = (ny - ky) / kr
          const q = Math.hypot(dx, dy)
          if (q > 1.4 || q === 0) continue
          const slope = q < 1 ? 2 * q : 0
          const rim = (-2 * ((q - 1) / 0.13) * Math.exp(-(((q - 1) / 0.13) ** 2)) * 0.35) / 0.13
          const g = (slope + rim) * 0.32
          gx += (g * dx) / q
          gy += (g * dy) / q
          if (q < 1.15 && q > 0.9) albedo += 0.05
        }
        // Tycho's bright rays, fanned across the southern highlands.
        const tdx = nx - tycho[0]
        const tdy = ny - tycho[1]
        const td = Math.hypot(tdx, tdy)
        const ray = Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(tdy, tdx) * 9 + 1.3), 14)
        albedo += ray * Math.exp(-td * 2.2) * 0.25 * (td > 0.06 ? 1 : 0)

        // Tilt the normal by the crater slopes, then light it.
        let px = nx - gx
        let py = ny - gy
        let pz = nz
        const len = Math.hypot(px, py, pz)
        px /= len
        py /= len
        pz /= len
        const lam = px * sun[0] + py * sun[1] + pz * sun[2]
        const day = smooth(-0.03, 0.07, lam)
        // The engraver's light, from the upper left, keeps relief readable even at full moon.
        const relief = clamp(0.5 + (-gx * 0.7 - gy * 0.7) * 1.4, 0, 1)
        const lit = albedo * (0.72 + 0.28 * Math.sqrt(Math.max(lam, 0))) * (0.8 + 0.4 * relief)
        const earthshine = albedo * p.earthshine * (0.85 + 0.3 * relief)
        let tone = clamp(lit * day + earthshine * (1 - day))
        tone = tone * (0.82 + 0.18 * hatch(x, y, tone, 0.9, 1.6))
        // An engraved outline around the whole disc, so the dark limb still has an edge.
        tone = Math.max(tone, Math.exp(-((((1 - Math.sqrt(d2)) * R) / 0.9) ** 2)) * 0.45)
        buf[i] = clamp(tone)
      }
    }
    return buf
  },
})
