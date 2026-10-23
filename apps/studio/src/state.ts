import {
  DITHER_METHODS,
  generators,
  grayPalette,
  isGeneratorName,
  paletteFromHex,
  palettes,
  toHex,
  type DitherMethod,
  type GeneratorName,
  type Palette,
  type PaletteName,
} from 'plate-engine'
import { deviceById, DEVICES } from './devices'

export type Mode = 'screen' | 'eink'
export type PaletteChoice = PaletteName | 'custom'
export type Fit = 'cover' | 'contain'

/** Everything that decides the plate. All of it except the dropped image lives in the URL. */
export type State = {
  source: 'generator' | 'image'
  gen: GeneratorName
  seed: number
  /** Only the parameters that differ from their defaults. */
  params: Record<string, number>
  method: DitherMethod
  palette: PaletteChoice
  custom: string[]
  /** Output pixels per dither cell. */
  cell: number
  /** Screen mode output size in pixels. */
  width: number
  height: number
  brightness: number
  contrast: number
  gamma: number
  invert: boolean
  grain: number
  mode: Mode
  device: string
  /** E-ink: tones on the panel. */
  greys: number
  /** Quarter turns clockwise. */
  rotate: number
  fit: Fit
}

export const DEFAULTS: State = {
  source: 'generator',
  gen: 'fern',
  seed: 7,
  params: {},
  method: 'bayer8',
  palette: 'herbarium',
  custom: ['#1d1f2b', '#6b5e8c', '#f4efe6'],
  cell: 3,
  width: 900,
  height: 900,
  brightness: 0,
  contrast: 1,
  gamma: 1,
  invert: false,
  grain: 0,
  mode: 'screen',
  device: DEVICES[0].id,
  greys: DEVICES[0].greys,
  rotate: 0,
  fit: 'cover',
}

export const PALETTE_LABELS: Record<PaletteChoice, string> = {
  herbarium: 'Herbarium (3)',
  oneBit: '1-bit (2)',
  handheld: 'Handheld green (4)',
  newsprint: 'Newsprint (3)',
  gray4: 'Grey (4)',
  gray16: 'Grey (16)',
  custom: 'Custom',
}

export const METHOD_LABELS: Record<DitherMethod, string> = {
  threshold: 'Threshold',
  bayer2: 'Bayer 2×2',
  bayer4: 'Bayer 4×4',
  bayer8: 'Bayer 8×8',
  'blue-noise': 'Blue noise',
  'floyd-steinberg': 'Floyd–Steinberg',
  atkinson: 'Atkinson',
}

/** The palette the plate is printed with. E-ink mode always prints in greys. */
export function paletteOf(s: State): Palette {
  if (s.mode === 'eink') return grayPalette(s.greys)
  if (s.palette === 'custom') {
    try {
      return paletteFromHex(s.custom)
    } catch {
      return palettes.herbarium
    }
  }
  return palettes[s.palette]
}

/** Output geometry: final pixel size, the cell grid to draw, and the turn to apply. */
export function planOf(s: State) {
  let outW = s.width
  let outH = s.height
  let rotate = 0
  if (s.mode === 'eink') {
    const d = deviceById(s.device)
    outW = d.editable ? s.width : d.width
    outH = d.editable ? s.height : d.height
    rotate = ((s.rotate % 4) + 4) % 4
  }
  // Draw in the turned frame, then rotate into the output frame.
  const drawW = rotate % 2 ? outH : outW
  const drawH = rotate % 2 ? outW : outH
  const cellsW = Math.ceil(drawW / s.cell)
  const cellsH = Math.ceil(drawH / s.cell)
  return { outW, outH, rotate, cellsW, cellsH }
}

const num = (v: string | null, lo: number, hi: number, def: number) => {
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
}
const int = (v: string | null, lo: number, hi: number, def: number) => Math.round(num(v, lo, hi, def))

/** Read state from a URL hash like `#g=fern&s=7&m=atkinson`. Unknown or bad values fall back to defaults. */
export function fromHash(hash: string): State {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const g = q.get('g') ?? ''
  const gen = isGeneratorName(g) ? g : DEFAULTS.gen
  const params: Record<string, number> = {}
  for (const [key, spec] of Object.entries(generators[gen].params)) {
    const v = q.get(`p.${key}`)
    if (v !== null && Number.isFinite(Number(v))) params[key] = Math.min(spec.max, Math.max(spec.min, Number(v)))
  }
  const m = q.get('m') as DitherMethod | null
  const pal = q.get('pal') as PaletteChoice | null
  const custom = (q.get('hex') ?? '')
    .split(/[-,]/)
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
  const mode: Mode = q.get('mode') === 'eink' ? 'eink' : 'screen'
  const device = deviceById(q.get('dev') ?? DEFAULTS.device)
  const greys = int(q.get('greys'), 2, 16, device.greys)
  return {
    source: 'generator',
    gen,
    seed: int(q.get('s'), 0, 2 ** 31 - 1, DEFAULTS.seed),
    params,
    method: m && (DITHER_METHODS as readonly string[]).includes(m) ? m : DEFAULTS.method,
    palette: pal && pal in PALETTE_LABELS ? pal : DEFAULTS.palette,
    custom: custom.length >= 2 && custom.length <= 16 ? custom : DEFAULTS.custom,
    cell: int(q.get('c'), 1, 12, DEFAULTS.cell),
    width: int(q.get('w'), 16, 4096, DEFAULTS.width),
    height: int(q.get('h'), 16, 4096, DEFAULTS.height),
    brightness: num(q.get('b'), -0.5, 0.5, 0),
    contrast: num(q.get('k'), 0.2, 3, 1),
    gamma: num(q.get('gm'), 0.3, 3, 1),
    invert: q.get('inv') === '1',
    grain: num(q.get('gr'), 0, 0.5, 0),
    mode,
    device: device.id,
    greys: [2, 4, 16].includes(greys) ? greys : device.greys,
    rotate: int(q.get('r'), 0, 3, 0),
    fit: q.get('fit') === 'contain' ? 'contain' : 'cover',
  }
}

/** Write state to a URL hash, leaving out anything at its default so links stay short. */
export function toHash(s: State): string {
  const q = new URLSearchParams()
  const put = (k: string, v: string | number, def: string | number) => {
    if (v !== def) q.set(k, String(v))
  }
  q.set('g', s.gen)
  put('s', s.seed, -1)
  for (const [k, v] of Object.entries(s.params)) q.set(`p.${k}`, String(+v.toFixed(6)))
  put('m', s.method, DEFAULTS.method)
  put('pal', s.palette, DEFAULTS.palette)
  if (s.palette === 'custom') q.set('hex', s.custom.map((h) => toHex(paletteFromHexSafe(h)).slice(1)).join('-'))
  put('c', s.cell, DEFAULTS.cell)
  put('b', s.brightness, 0)
  put('k', s.contrast, 1)
  put('gm', s.gamma, 1)
  put('inv', s.invert ? 1 : 0, 0)
  put('gr', s.grain, 0)
  put('mode', s.mode, 'screen')
  if (s.mode === 'screen' || deviceById(s.device).editable) {
    put('w', s.width, DEFAULTS.width)
    put('h', s.height, DEFAULTS.height)
  }
  if (s.mode === 'eink') {
    q.set('dev', s.device)
    put('greys', s.greys, deviceById(s.device).greys)
    put('r', s.rotate, 0)
  }
  put('fit', s.fit, 'cover')
  return '#' + q.toString()
}

function paletteFromHexSafe(h: string) {
  try {
    return paletteFromHex([h, '#000'])[0]
  } catch {
    return [0, 0, 0] as const
  }
}
