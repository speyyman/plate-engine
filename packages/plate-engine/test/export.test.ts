/**
 * Exporter round trips. PNGs are decoded with pngjs (an independent decoder);
 * BMPs with the small reader below, which follows the BITMAPINFOHEADER layout.
 */
import { PNG } from 'pngjs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  dither,
  encodeBMP,
  encodeGrayPNG,
  encodeIndexedPNG,
  encodePNG,
  generate,
  grayPalette,
  palettes,
  renderCPU,
  toRGBA,
  zlibStored,
  type BmpBits,
  type Palette,
} from '../src/index.js'

const W = 37 // odd widths exercise row padding and bit packing
const H = 23

function decodePNG(bytes: Uint8Array) {
  return PNG.sync.read(Buffer.from(bytes))
}

/** Minimal BMP reader: returns size, depth, palette and RGB per pixel (top-down). */
function readBMP(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(String.fromCharCode(bytes[0], bytes[1])).toBe('BM')
  expect(dv.getUint32(2, true)).toBe(bytes.length)
  const offset = dv.getUint32(10, true)
  expect(dv.getUint32(14, true)).toBe(40)
  const width = dv.getInt32(18, true)
  const height = dv.getInt32(22, true)
  const bits = dv.getUint16(28, true)
  expect(dv.getUint32(30, true)).toBe(0)
  const used = dv.getUint32(46, true)
  const colours: [number, number, number][] = []
  for (let i = 0; i < used; i++) colours.push([bytes[54 + i * 4 + 2], bytes[54 + i * 4 + 1], bytes[54 + i * 4]])
  const rowBytes = Math.ceil((width * bits) / 32) * 4
  expect(offset + rowBytes * height).toBe(bytes.length)
  const rgb: number[][] = []
  for (let y = 0; y < height; y++) {
    const row = offset + (height - 1 - y) * rowBytes
    for (let x = 0; x < width; x++) {
      if (bits === 24) {
        rgb.push([bytes[row + x * 3 + 2], bytes[row + x * 3 + 1], bytes[row + x * 3]])
      } else {
        let idx: number
        if (bits === 8) idx = bytes[row + x]
        else if (bits === 4) idx = (bytes[row + (x >> 1)] >> (x & 1 ? 0 : 4)) & 15
        else idx = (bytes[row + (x >> 3)] >> (7 - (x & 7))) & 1
        rgb.push(colours[idx])
      }
    }
  }
  return { width, height, bits, colours, rgb }
}

function expected(indices: Uint8Array, palette: Palette) {
  return Array.from(indices, (i) => [...palette[i]])
}

describe('PNG', () => {
  it('RGBA round-trips through an independent decoder', async () => {
    const img = renderCPU(generate('medallion', W, H), W, H, { palette: palettes.herbarium })
    const png = decodePNG(await encodePNG(img))
    expect(png.width).toBe(W)
    expect(png.height).toBe(H)
    expect(Buffer.from(png.data).equals(Buffer.from(img.data))).toBe(true)
  })

  for (const palette of [palettes.oneBit, palettes.handheld, palettes.herbarium, grayPalette(16)]) {
    it(`indexed PNG with ${palette.length} colours round-trips`, async () => {
      const idx = dither(generate('eye', W, H), W, H, { levels: palette.length, method: 'floyd-steinberg' })
      const bytes = await encodeIndexedPNG(idx, W, H, palette)
      // IHDR colour type 3 (indexed) at the smallest bit depth.
      expect(bytes[25]).toBe(3)
      expect(bytes[24]).toBe(palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : 4)
      const png = decodePNG(bytes)
      expect(Buffer.from(png.data).equals(Buffer.from(toRGBA(idx, palette)))).toBe(true)
    })
  }

  it('greyscale PNG round-trips', async () => {
    const gray = Uint8Array.from({ length: W * H }, (_, i) => (i * 7) % 256)
    const bytes = await encodeGrayPNG(gray, W, H)
    expect(bytes[25]).toBe(0)
    const png = decodePNG(bytes)
    for (let i = 0; i < W * H; i++) expect(png.data[i * 4]).toBe(gray[i])
  })

  it('stored-block zlib fallback inflates back to the input', () => {
    const data = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 31) & 255)
    expect(Buffer.from(inflateSync(zlibStored(data))).equals(Buffer.from(data))).toBe(true)
  })
})

describe('BMP', () => {
  const cases: [BmpBits, Palette][] = [
    [1, palettes.oneBit],
    [4, grayPalette(16)],
    [4, palettes.herbarium],
    [8, grayPalette(16)],
    [8, palettes.handheld],
    [24, palettes.herbarium],
  ]
  for (const [bits, palette] of cases) {
    it(`${bits}-bit with ${palette.length} colours round-trips`, () => {
      const idx = dither(generate('fern', W, H), W, H, { levels: palette.length, method: 'atkinson' })
      const out = readBMP(encodeBMP(idx, W, H, palette, bits))
      expect(out.width).toBe(W)
      expect(out.height).toBe(H)
      expect(out.bits).toBe(bits)
      expect(out.colours.length).toBe(bits === 24 ? 0 : palette.length)
      expect(out.rgb).toEqual(expected(idx, palette))
    })
  }

  it('refuses a palette that does not fit the depth', () => {
    const idx = new Uint8Array(4)
    expect(() => encodeBMP(idx, 2, 2, palettes.herbarium, 1)).toThrow(RangeError)
    expect(() => encodeBMP(idx, 2, 2, grayPalette(17), 4)).toThrow(RangeError)
  })
})
