import { mulberry32 } from '../rng.js'
import { branches } from './branches.js'
import { chladni } from './chladni.js'
import { eye } from './eye.js'
import { fern } from './fern.js'
import { medallion } from './medallion.js'
import { moon } from './moon.js'
import { orbits } from './orbits.js'
import { phyllotaxis } from './phyllotaxis.js'
import { ridges } from './ridges.js'
import { sphere } from './sphere.js'
import { sunburst } from './sunburst.js'
import type { Generator, ParamSpecs } from './types.js'

export { branches, chladni, eye, fern, medallion, moon, orbits, phyllotaxis, ridges, sphere, sunburst }
export { GOLDEN_ANGLE_DEG } from './phyllotaxis.js'
export { defineGenerator } from './types.js'
export type { DrawFn, Generator, NumberParam, ParamSpecs } from './types.js'

/** Every built-in generator, keyed by name. */
export const generators = {
  sunburst,
  sphere,
  orbits,
  eye,
  ridges,
  medallion,
  fern,
  phyllotaxis,
  branches,
  chladni,
  moon,
} as const

/** Name of a built-in generator. */
export type GeneratorName = keyof typeof generators

/** The parameter object of a built-in generator. */
export type ParamsOf<N extends GeneratorName> = (typeof generators)[N] extends Generator<infer P> ? P : never

/** True if `name` is a built-in generator. */
export function isGeneratorName(name: string): name is GeneratorName {
  return Object.prototype.hasOwnProperty.call(generators, name)
}

/** Fill in defaults for any missing parameter and clamp the rest to their declared range. */
export function resolveParams<P extends Record<string, number>>(specs: ParamSpecs<P>, given: Partial<P> = {}): P {
  const out: Record<string, number> = {}
  for (const key of Object.keys(specs)) {
    const spec = specs[key as keyof P]
    const v = given[key as keyof P]
    const def = typeof spec.default === 'function' ? spec.default() : spec.default
    out[key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, v)) : def
  }
  return out as P
}

/** Options for {@link generate}. */
export type GenerateOptions<P> = {
  /** PRNG seed. The site's plates use 7. */
  seed?: number
  /** Parameters to override; the rest take their defaults. */
  params?: Partial<P>
}

/**
 * Draw a built-in generator into a new luminance buffer of `width * height`
 * cells (row-major, 0 = dark, 1 = light).
 *
 * @example
 * const lum = generate('fern', 240, 400, { seed: 7 })
 */
export function generate<N extends GeneratorName>(
  name: N,
  width: number,
  height: number,
  options: GenerateOptions<ParamsOf<N>> = {},
): Float32Array {
  const g = generators[name] as unknown as Generator<Record<string, number>>
  return runGenerator(g, width, height, options as GenerateOptions<Record<string, number>>)
}

/** Draw any generator, built-in or your own, with a seed and optional parameter overrides. */
export function runGenerator<P extends Record<string, number>>(
  g: Generator<P>,
  width: number,
  height: number,
  { seed = 7, params }: GenerateOptions<P> = {},
): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`plate size must be positive integers, got ${width}×${height}`)
  }
  return g.draw(width, height, mulberry32(seed), resolveParams(g.params, params))
}
