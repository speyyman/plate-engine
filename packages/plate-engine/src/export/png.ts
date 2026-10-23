/**
 * PNG encoders with no dependencies: RGBA, palette-indexed (1, 2, 4 or 8 bits
 * per pixel) and 8-bit greyscale. Compression uses the platform's
 * `CompressionStream('deflate')` (browsers and Node 18+), which emits the zlib
 * stream PNG expects; where it is missing, stored (uncompressed) deflate blocks
 * keep the file valid.
 */

import type { Palette } from '../palette.js'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 as used by PNG and zlib's gzip. */
export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  let c = crc
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** zlib stream made of stored (uncompressed) deflate blocks. Always valid, never small. */
export function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535))
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4)
  out[0] = 0x78
  out[1] = 0x01
  let o = 2
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535
    const len = Math.min(65535, data.length - start)
    out[o++] = b === blocks - 1 ? 1 : 0
    out[o++] = len & 255
    out[o++] = len >> 8
    out[o++] = ~len & 255
    out[o++] = (~len >> 8) & 255
    out.set(data.subarray(start, start + len), o)
    o += len
  }
  const ad = adler32(data)
  out[o++] = ad >>> 24
  out[o++] = (ad >>> 16) & 255
  out[o++] = (ad >>> 8) & 255
  out[o] = ad & 255
  return out
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return zlibStored(data)
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

async function assemble(
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  raw: Uint8Array,
  extra: Uint8Array[] = [],
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError('bad image size')
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  ihdr[8] = bitDepth
  ihdr[9] = colorType
  // compression 0, filter 0, interlace 0
  return concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/** Encode RGBA bytes (alpha kept) as a truecolour PNG. */
export async function encodePNG(image: {
  width: number
  height: number
  data: ArrayLike<number>
}): Promise<Uint8Array> {
  const { width, height, data } = image
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = data[y * stride + i]
  }
  return assemble(width, height, 8, 6, raw)
}

/** Smallest PNG bit depth that can index `n` colours. */
export function indexedBitDepth(n: number): 1 | 2 | 4 | 8 {
  return n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8
}

/** Pack indices into rows of `bits` per pixel, each row prefixed with filter byte 0. */
function packRows(indices: ArrayLike<number>, width: number, height: number, bits: number): Uint8Array {
  const rowBytes = Math.ceil((width * bits) / 8)
  const raw = new Uint8Array((rowBytes + 1) * height)
  const perByte = 8 / bits
  for (let y = 0; y < height; y++) {
    const row = y * (rowBytes + 1) + 1
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x]
      const shift = 8 - bits * ((x % perByte) + 1)
      raw[row + Math.floor(x / perByte)] |= v << shift
    }
  }
  return raw
}

/**
 * Encode tone indices with their palette as a palette-indexed PNG, at the
 * smallest bit depth that fits (1 bit for 2 colours, 2 for 4, 4 for 16).
 */
export async function encodeIndexedPNG(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: Palette,
): Promise<Uint8Array> {
  if (palette.length < 1 || palette.length > 256) throw new RangeError('indexed PNG needs 1 to 256 colours')
  for (let i = 0; i < width * height; i++) {
    if (indices[i] >= palette.length)
      throw new RangeError(`index ${indices[i]} outside a ${palette.length}-colour palette`)
  }
  const bits = indexedBitDepth(palette.length)
  const plte = new Uint8Array(palette.length * 3)
  palette.forEach((c, i) => plte.set(c, i * 3))
  return assemble(width, height, bits, 3, packRows(indices, width, height, bits), [chunk('PLTE', plte)])
}

/** Encode 8-bit grey values (one byte per pixel) as a greyscale PNG. */
export async function encodeGrayPNG(gray: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  return assemble(width, height, 8, 0, packRows(gray, width, height, 8))
}
