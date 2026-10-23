/** Rec. 709 luma of RGBA bytes, 0..1 per pixel. Alpha is composited over white. */
export function rgbaToLuminance(data: ArrayLike<number>, width: number, height: number): Float32Array {
  const n = width * height
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const a = data[o + 3] / 255
    const y = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255
    lum[i] = y * a + (1 - a)
  }
  return lum
}

/** A rectangle of cells, `x0 <= x < x1`, `y0 <= y < y1`. */
export type Region = { x0: number; y0: number; x1: number; y1: number }

/**
 * The site's contrast curve for scanned engravings, applied in place inside
 * `region` (default: everything). Old scans have yellowed paper and grey ink,
 * so it stretches the 2nd percentile to black and the 85th to white (most of an
 * engraving is paper), then leans dark with a power of 1.5 and a smoothstep so
 * fine lines read as ink rather than a mid-tone wash.
 */
export function engravingCurve(lum: Float32Array, width: number, height: number, region?: Region): Float32Array {
  const { x0, y0, x1, y1 } = region ?? { x0: 0, y0: 0, x1: width, y1: height }
  const inside: number[] = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) inside.push(lum[y * width + x])
  const sorted = Float32Array.from(inside).sort()
  const lo = sorted[Math.floor(sorted.length * 0.02)] ?? 0
  const hi = sorted[Math.floor(sorted.length * 0.85)] ?? 1
  const span = Math.max(hi - lo, 0.05)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x
      const l = Math.min(Math.max((lum[i] - lo) / span, 0), 1) ** 1.5
      lum[i] = l * l * (3 - 2 * l)
    }
  }
  return lum
}

export type Adjustments = {
  /** Added to every cell, −1..1. Default 0. */
  brightness?: number
  /** Scales around mid-grey; 1 leaves the image alone. Default 1. */
  contrast?: number
  /** Power applied after brightness and contrast; above 1 darkens mid-tones. Default 1. */
  gamma?: number
  /** Swap light and dark. Default false. */
  invert?: boolean
}

/** Brightness, contrast, gamma and invert, returning a new clamped buffer. */
export function adjust(
  lum: ArrayLike<number>,
  { brightness = 0, contrast = 1, gamma = 1, invert = false }: Adjustments,
): Float32Array {
  const out = new Float32Array(lum.length)
  for (let i = 0; i < lum.length; i++) {
    let v = (lum[i] - 0.5) * contrast + 0.5 + brightness
    v = v < 0 ? 0 : v > 1 ? 1 : v
    if (gamma !== 1) v = v ** gamma
    out[i] = invert ? 1 - v : v
  }
  return out
}

/** How an image is placed into a plate of a different shape. */
export type Fit = 'cover' | 'contain'

/** Anything `CanvasRenderingContext2D.drawImage` accepts and that reports its size. */
export type DrawableImage = CanvasImageSource & { width: number; height: number }

/**
 * Draw an image into a `width × height` luminance buffer (browsers and
 * workers with `OffscreenCanvas`). `cover` crops to fill; `contain` fits the
 * whole image inside a 5% margin that prints as paper. With `curve: true` the
 * {@link engravingCurve} is applied to the covered cells, as on the site.
 */
export function imageToLuminance(
  img: DrawableImage,
  width: number,
  height: number,
  { fit = 'cover', curve = true }: { fit?: Fit; curve?: boolean } = {},
): Float32Array {
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('2D canvas is not available')
  const iw = img.width
  const ih = img.height
  const scale = fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih) * 0.9
  const dw = iw * scale
  const dh = ih * scale
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, dx, dy, dw, dh)
  const region = {
    x0: Math.max(0, Math.ceil(dx)),
    y0: Math.max(0, Math.ceil(dy)),
    x1: Math.min(width, Math.floor(dx + dw)),
    y1: Math.min(height, Math.floor(dy + dh)),
  }
  const lum = rgbaToLuminance(ctx.getImageData(0, 0, width, height).data, width, height)
  // Outside the image is paper.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < region.x0 || x >= region.x1 || y < region.y0 || y >= region.y1) lum[y * width + x] = 1
    }
  }
  return curve ? engravingCurve(lum, width, height, region) : lum
}
