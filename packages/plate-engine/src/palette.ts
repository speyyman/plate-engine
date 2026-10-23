/** An sRGB colour as [r, g, b], each 0..255. */
export type RGB = readonly [number, number, number]

/** An ordered list of 2 to 16 colours, darkest tone first. Index i is tone i. */
export type Palette = readonly RGB[]

/** Parse `#rgb` or `#rrggbb` (the `#` is optional). Returns null if it is not a hex colour. */
export function parseHex(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, '')
  if (/^[\da-f]{3}$/i.test(s)) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)]
  }
  if (/^[\da-f]{6}$/i.test(s))
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  return null
}

/** Format a colour as lowercase `#rrggbb`. */
export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** Build a palette from hex strings. Throws on a malformed colour or a size outside 2..16. */
export function paletteFromHex(hexes: readonly string[]): Palette {
  const p = hexes.map((h) => {
    const c = parseHex(h)
    if (!c) throw new Error(`not a hex colour: ${h}`)
    return c
  })
  assertPalette(p)
  return p
}

/** Throw unless the palette has 2 to 16 valid colours. */
export function assertPalette(p: Palette): void {
  if (p.length < 2 || p.length > 16) throw new RangeError(`a palette needs 2 to 16 colours, got ${p.length}`)
  for (const c of p) {
    if (c.length !== 3 || c.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
      throw new RangeError(`bad colour ${JSON.stringify(c)}`)
    }
  }
}

/** `n` evenly spaced greys from black to white: grey i = round(255 · i / (n − 1)). */
export function grayPalette(n: number): Palette {
  if (!Number.isInteger(n) || n < 2 || n > 256) throw new RangeError(`grey levels must be 2..256, got ${n}`)
  return Array.from({ length: n }, (_, i) => {
    const v = Math.round((255 * i) / (n - 1))
    return [v, v, v] as const
  })
}

/** Relative luminance of an sRGB colour (WCAG 2 formula), 0..1. */
export function relativeLuminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Return the palette sorted from darkest to lightest by relative luminance. */
export function sortByLuminance(p: Palette): Palette {
  return [...p].sort((a, b) => relativeLuminance(a) - relativeLuminance(b))
}

/** Named palettes, darkest first. */
export const palettes = {
  /** The three tones of speyyman.github.io: forest, moss, bone. */
  herbarium: paletteFromHex(['#142a1f', '#4f7a5a', '#ece4d0']),
  /** Pure black and white. */
  oneBit: paletteFromHex(['#000000', '#ffffff']),
  /** Four greens in the style of an early handheld console's reflective LCD. */
  handheld: paletteFromHex(['#0f380f', '#306230', '#8bac0f', '#9bbc0f']),
  /** Ink, a mid grey and the warm off-white of newsprint. */
  newsprint: paletteFromHex(['#1b1b1b', '#7d7a73', '#efebe1']),
  /** Four greys, like a 2-bit e-paper panel. */
  gray4: grayPalette(4),
  /** Sixteen greys, like a 4-bit e-paper panel. */
  gray16: grayPalette(16),
} as const satisfies Record<string, Palette>

export type PaletteName = keyof typeof palettes
