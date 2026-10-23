/**
 * plate-engine: procedural engravings and the dither that prints them.
 *
 * Generators draw luminance buffers from a seed and a few parameters; the
 * dither reduces them to a small palette (CPU everywhere, WebGL in browsers);
 * the exporters write PNG and BMP files, including the indexed and greyscale
 * formats e-paper devices read.
 *
 * @packageDocumentation
 */

export { mulberry32, type Rng } from './rng.js'
export { moonPhase, phaseName, SYNODIC_DAYS, type MoonPhase } from './astro.js'
export {
  generators,
  generate,
  runGenerator,
  resolveParams,
  isGeneratorName,
  defineGenerator,
  GOLDEN_ANGLE_DEG,
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
  type Generator,
  type GeneratorName,
  type GenerateOptions,
  type DrawFn,
  type NumberParam,
  type ParamSpecs,
  type ParamsOf,
} from './generators/index.js'
export {
  palettes,
  parseHex,
  toHex,
  paletteFromHex,
  assertPalette,
  grayPalette,
  relativeLuminance,
  sortByLuminance,
  type RGB,
  type Palette,
  type PaletteName,
} from './palette.js'
export {
  rgbaToLuminance,
  engravingCurve,
  adjust,
  imageToLuminance,
  type Adjustments,
  type Region,
  type Fit,
  type DrawableImage,
} from './luminance.js'
export { bayerIndices, bayerMap, blueNoiseMap, blueNoiseRanks, type ThresholdMap } from './dither/matrices.js'
export {
  DITHER_METHODS,
  ORDERED_METHODS,
  SITE_PLATE,
  dither,
  toRGBA,
  renderCPU,
  ditherPlate,
  thresholdMapFor,
  type DitherMethod,
  type DitherOptions,
  type RenderOptions,
  type RGBAImage,
} from './dither/dither.js'
export {
  WebGLDitherRenderer,
  getWebGLRenderer,
  renderAuto,
  type GLRenderOptions,
  type RenderPath,
} from './render/webgl.js'
export { encodePNG, encodeIndexedPNG, encodeGrayPNG, indexedBitDepth, crc32, zlibStored } from './export/png.js'
export { encodeBMP, type BmpBits } from './export/bmp.js'
export { rotate, scaleNearest, fitTo, type Grid } from './transform.js'
