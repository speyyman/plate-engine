import type { Rng } from '../rng.js'

/** One numeric parameter of a generator, with the range a UI should offer. */
export type NumberParam = {
  /** Short human label, e.g. "Rays". */
  label: string
  /** What the parameter changes, in one sentence. */
  description: string
  /**
   * The value that reproduces the original plate. A function is evaluated on
   * each call (the moon uses one for "the phase right now").
   */
  default: number | (() => number)
  min: number
  max: number
  step: number
}

/** Parameter specs keyed by name. */
export type ParamSpecs<P extends Record<string, number>> = { readonly [K in keyof P]: NumberParam }

/**
 * The common interface every generator implements: draw a luminance buffer
 * (row-major, `width * height`, 0 = dark, 1 = light) from a seeded RNG and a
 * full set of parameters.
 */
export type DrawFn<P extends Record<string, number>> = (
  width: number,
  height: number,
  rng: () => number,
  params: P,
) => Float32Array

/** A procedural engraving: a drawing function plus a description of its parameters. */
export interface Generator<P extends Record<string, number> = Record<string, number>> {
  /** Stable identifier, e.g. `"fern"`. */
  readonly name: string
  /** Display title, e.g. "Barnsley fern". */
  readonly title: string
  /** One sentence on what it draws. */
  readonly description: string
  readonly params: ParamSpecs<P>
  readonly draw: DrawFn<P>
}

/** Define a generator with full type inference for its parameters. */
export function defineGenerator<P extends Record<string, number>>(g: Generator<P>): Generator<P> {
  return g
}

export type { Rng }
