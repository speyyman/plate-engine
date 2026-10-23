/// <reference lib="webworker" />
/**
 * Renders plates off the main thread: draw (cached), adjust, dither, then
 * rotate, enlarge and crop to the exact output size. The result is the tone
 * index of every output pixel, which is exactly what gets exported.
 */
import {
  adjust,
  crop,
  dither,
  generate,
  rotate,
  scaleNearest,
  type DitherMethod,
  type GeneratorName,
} from 'plate-engine'

export type RenderJob = {
  id: number
  source:
    | { kind: 'generator'; gen: GeneratorName; seed: number; params: Record<string, number> }
    | { kind: 'luminance'; key: string; lum: Float32Array }
  cellsW: number
  cellsH: number
  adjust: { brightness: number; contrast: number; gamma: number; invert: boolean }
  dither: { method: DitherMethod; levels: number; grain: number; seed: number }
  rotate: number
  cell: number
  outW: number
  outH: number
}

export type RenderResult =
  | { id: number; ok: true; indices: Uint8Array; width: number; height: number; ms: number }
  | { id: number; ok: false; error: string }

let cacheKey = ''
let cacheLum: Float32Array | null = null

self.onmessage = (e: MessageEvent<RenderJob>) => {
  const job = e.data
  try {
    const t0 = performance.now()
    let lum: Float32Array
    if (job.source.kind === 'generator') {
      const { gen, seed, params } = job.source
      const key = JSON.stringify([gen, seed, params, job.cellsW, job.cellsH])
      if (key !== cacheKey || !cacheLum) {
        cacheLum = generate(gen, job.cellsW, job.cellsH, { seed, params })
        cacheKey = key
      }
      lum = cacheLum
    } else {
      lum = job.source.lum
    }
    const adjusted = adjust(lum, job.adjust)
    const idx = dither(adjusted, job.cellsW, job.cellsH, job.dither)
    let grid = { data: idx, width: job.cellsW, height: job.cellsH }
    if (job.rotate) grid = rotate(grid, job.rotate)
    if (job.cell > 1) grid = scaleNearest(grid, job.cell)
    if (grid.width !== job.outW || grid.height !== job.outH) grid = crop(grid, job.outW, job.outH)
    const ms = performance.now() - t0
    const res: RenderResult = { id: job.id, ok: true, indices: grid.data, width: grid.width, height: grid.height, ms }
    ;(self as unknown as Worker).postMessage(res, [grid.data.buffer])
  } catch (err) {
    const res: RenderResult = { id: job.id, ok: false, error: err instanceof Error ? err.message : String(err) }
    ;(self as unknown as Worker).postMessage(res)
  }
}
