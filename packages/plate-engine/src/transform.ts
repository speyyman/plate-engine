type Cells = Uint8Array | Float32Array

/** A cell buffer with its size. */
export type Grid<T extends Cells> = { data: T; width: number; height: number }

function like<T extends Cells>(src: T, n: number): T {
  return (src instanceof Float32Array ? new Float32Array(n) : new Uint8Array(n)) as T
}

/** Rotate a cell buffer clockwise by `quarterTurns` × 90°. */
export function rotate<T extends Cells>(src: Grid<T>, quarterTurns: number): Grid<T> {
  const q = ((Math.round(quarterTurns) % 4) + 4) % 4
  const { data, width: w, height: h } = src
  if (q === 0) return { data: data.slice() as T, width: w, height: h }
  const W = q === 2 ? w : h
  const H = q === 2 ? h : w
  const out = like(data, w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let X: number
      let Y: number
      if (q === 1) {
        X = h - 1 - y
        Y = x
      } else if (q === 2) {
        X = w - 1 - x
        Y = h - 1 - y
      } else {
        X = y
        Y = w - 1 - x
      }
      out[Y * W + X] = data[y * w + x]
    }
  }
  return { data: out, width: W, height: H }
}

/** Enlarge each cell to a `factor × factor` block (nearest neighbour), keeping dither patterns crisp. */
export function scaleNearest<T extends Cells>(src: Grid<T>, factor: number): Grid<T> {
  if (!Number.isInteger(factor) || factor < 1)
    throw new RangeError(`scale factor must be a positive integer, got ${factor}`)
  const { data, width: w, height: h } = src
  const W = w * factor
  const H = h * factor
  const out = like(data, W * H)
  for (let Y = 0; Y < H; Y++) {
    const row = Math.floor(Y / factor) * w
    for (let X = 0; X < W; X++) out[Y * W + X] = data[row + Math.floor(X / factor)]
  }
  return { data: out, width: W, height: H }
}

/**
 * Fit a cell buffer into a `width × height` frame by nearest-neighbour
 * resampling. `cover` fills the frame and crops; `contain` letterboxes with `fill`.
 */
export function fitTo<T extends Cells>(
  src: Grid<T>,
  width: number,
  height: number,
  mode: 'cover' | 'contain',
  fill = 0,
): Grid<T> {
  const { data, width: w, height: h } = src
  const scale = mode === 'cover' ? Math.max(width / w, height / h) : Math.min(width / w, height / h)
  const out = like(data, width * height)
  out.fill(fill)
  const ox = (width - w * scale) / 2
  const oy = (height - h * scale) / 2
  for (let Y = 0; Y < height; Y++) {
    const sy = Math.floor((Y + 0.5 - oy) / scale)
    if (sy < 0 || sy >= h) continue
    for (let X = 0; X < width; X++) {
      const sx = Math.floor((X + 0.5 - ox) / scale)
      if (sx >= 0 && sx < w) out[Y * width + X] = data[sy * w + sx]
    }
  }
  return { data: out, width, height }
}
