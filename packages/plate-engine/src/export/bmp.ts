/**
 * Windows BMP encoder (BITMAPINFOHEADER, uncompressed, bottom-up rows padded to
 * four bytes). Many e-readers and e-paper controllers read 1-, 4- and 8-bit
 * indexed BMPs directly, which is why this format is here.
 */

import type { Palette } from '../palette.js'

/** Bits per pixel the encoder writes. 1, 4 and 8 are palette-indexed; 24 is BGR truecolour. */
export type BmpBits = 1 | 4 | 8 | 24

/**
 * Encode tone indices and their palette as a BMP.
 * The palette must fit the bit depth: up to 2 colours at 1 bit, 16 at 4, 256 at 8.
 */
export function encodeBMP(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: Palette,
  bits: BmpBits,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError('bad image size')
  if (![1, 4, 8, 24].includes(bits)) throw new RangeError(`unsupported BMP depth ${bits}`)
  const indexed = bits !== 24
  if (indexed && palette.length > 2 ** bits)
    throw new RangeError(`${palette.length} colours do not fit in ${bits} bits`)
  for (let i = 0; i < width * height; i++) {
    if (indices[i] >= palette.length)
      throw new RangeError(`index ${indices[i]} outside a ${palette.length}-colour palette`)
  }
  const colours = indexed ? palette.length : 0
  const rowBytes = Math.ceil((width * bits) / 32) * 4
  const pixelOffset = 14 + 40 + colours * 4
  const size = pixelOffset + rowBytes * height
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)

  // BITMAPFILEHEADER
  out[0] = 0x42 // B
  out[1] = 0x4d // M
  dv.setUint32(2, size, true)
  dv.setUint32(10, pixelOffset, true)
  // BITMAPINFOHEADER
  dv.setUint32(14, 40, true)
  dv.setInt32(18, width, true)
  dv.setInt32(22, height, true) // positive: rows stored bottom-up
  dv.setUint16(26, 1, true) // planes
  dv.setUint16(28, bits, true)
  dv.setUint32(30, 0, true) // BI_RGB, uncompressed
  dv.setUint32(34, rowBytes * height, true)
  dv.setInt32(38, 2835, true) // 72 dpi in pixels per metre
  dv.setInt32(42, 2835, true)
  dv.setUint32(46, colours, true)
  dv.setUint32(50, colours, true)
  // Colour table, BGRA with A = 0
  for (let i = 0; i < colours; i++) {
    const [r, g, b] = palette[i]
    out[54 + i * 4] = b
    out[54 + i * 4 + 1] = g
    out[54 + i * 4 + 2] = r
  }

  for (let y = 0; y < height; y++) {
    const row = pixelOffset + (height - 1 - y) * rowBytes
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x]
      if (bits === 24) {
        const [r, g, b] = palette[v]
        out[row + x * 3] = b
        out[row + x * 3 + 1] = g
        out[row + x * 3 + 2] = r
      } else if (bits === 8) {
        out[row + x] = v
      } else if (bits === 4) {
        out[row + (x >> 1)] |= x & 1 ? v : v << 4
      } else {
        out[row + (x >> 3)] |= v << (7 - (x & 7))
      }
    }
  }
  return out
}
