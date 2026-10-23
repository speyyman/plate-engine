// Draw the README figures with the library itself. Run after `npm run build`.
// Writes docs/methods.png (one plate, every dither method, two tones) and
// docs/generators.png (every generator, the site's three-tone plate dither).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as pe from '../dist/index.js'

const out = (name) => fileURLToPath(new URL(`../../../docs/${name}`, import.meta.url))
const GAP = 6
const PAPER = [236, 233, 226]

/** Lay tiles (index buffers + palette) out in a grid on a light ground, each scaled by `k`. */
async function sheet(tiles, cols, k, file) {
  const tw = tiles[0].w * k
  const th = tiles[0].h * k
  const rows = Math.ceil(tiles.length / cols)
  const W = cols * tw + (cols + 1) * GAP
  const H = rows * th + (rows + 1) * GAP
  const data = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) data.set([...PAPER, 255], i * 4)
  tiles.forEach((t, n) => {
    const big = pe.scaleNearest({ data: t.idx, width: t.w, height: t.h }, k)
    const rgba = pe.toRGBA(big.data, t.palette)
    const ox = GAP + (n % cols) * (tw + GAP)
    const oy = GAP + Math.floor(n / cols) * (th + GAP)
    for (let y = 0; y < th; y++) data.set(rgba.subarray(y * tw * 4, (y + 1) * tw * 4), ((oy + y) * W + ox) * 4)
  })
  writeFileSync(file, await pe.encodePNG({ width: W, height: H, data }))
  console.log(`wrote ${file} (${W}×${H})`)
}

const S = 160
const lum = pe.generate('sphere', S, S)
await sheet(
  pe.DITHER_METHODS.map((method) => ({
    w: S,
    h: S,
    palette: pe.palettes.oneBit,
    idx: pe.dither(lum, S, S, { method, levels: 2 }),
  })),
  7,
  2,
  out('methods.png'),
)

const names = Object.keys(pe.generators)
await sheet(
  names.map((name) => {
    const params = name === 'moon' ? { phase: 0.3 } : {}
    const l = pe.generate(name, S, S, { params })
    return { w: S, h: S, palette: pe.palettes.herbarium, idx: pe.dither(l, S, S, { ...pe.SITE_PLATE }) }
  }),
  6,
  2,
  out('generators.png'),
)
