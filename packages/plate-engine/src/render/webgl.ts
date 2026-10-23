/**
 * One shared WebGL1 context dithers every plate on the page.
 *
 * Callers keep their own visible 2D canvases; each render draws into a hidden
 * GL canvas at cell resolution and is read back or copied across. One context
 * instead of dozens keeps well under the browser's limit on live WebGL
 * contexts, which is low on phones.
 *
 * Only ordered methods run here (error diffusion is sequential by nature). If
 * WebGL is missing or the context is lost, {@link getWebGLRenderer} returns
 * null and {@link renderAuto} falls back to the CPU.
 */

import {
  ORDERED_METHODS,
  renderCPU,
  thresholdMapFor,
  type DitherMethod,
  type RenderOptions,
  type RGBAImage,
} from '../dither/dither.js'
import { assertPalette, palettes } from '../palette.js'

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uLum;
uniform sampler2D uMap;      // threshold ranks as 16-bit values packed in R (high) and G (low)
uniform vec2 uSize;          // plate size in cells
uniform float uMapSize;      // side of the threshold map in cells
uniform float uMapCount;     // cells in the threshold map (size squared)
uniform float uTop;          // levels - 1
uniform float uGrain;
uniform float uSeed;
uniform float uProgress;
uniform vec3 uPalette[16];

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  // Cell coordinates with y running down, matching the luminance buffer.
  vec2 cell = vec2(floor(gl_FragCoord.x), uSize.y - 1.0 - floor(gl_FragCoord.y));
  float lum = texture2D(uLum, (cell + 0.5) / uSize).r;
  vec2 m = mod(cell, uMapSize);
  vec4 r = texture2D(uMap, (m + 0.5) / uMapSize);
  float th = (floor(r.r * 255.0 + 0.5) * 256.0 + floor(r.g * 255.0 + 0.5) + 0.5) / uMapCount;

  float v = lum + (hash(cell * 1.7 + 3.1 + uSeed) - 0.5) * uGrain;
  v = v * uProgress + hash(cell + uSeed * 17.0) * 0.35 * (1.0 - uProgress);

  float s = clamp(v, 0.0, 1.0) * uTop;
  float base = min(floor(s), uTop - 1.0);
  float idx = s - base > th ? base + 1.0 : base;
  vec3 col = uPalette[0];
  for (int i = 1; i < 16; i++) {
    if (float(i) == idx) col = uPalette[i];
  }
  gl_FragColor = vec4(col, 1.0);
}
`

/** Options for {@link WebGLDitherRenderer.render}. Same meaning as on the CPU; grain noise differs in pattern. */
export type GLRenderOptions = RenderOptions

/** A WebGL1 dither renderer bound to one hidden canvas. */
export class WebGLDitherRenderer {
  /** True once the browser has taken the context away. */
  lost = false
  private readonly u: Record<string, WebGLUniformLocation | null> = {}
  private readonly maps = new Map<DitherMethod, WebGLTexture>()
  private lumTex: WebGLTexture | null = null

  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly gl: WebGLRenderingContext,
  ) {
    const prog = gl.createProgram()
    if (!prog) throw new Error('createProgram failed')
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, FRAG],
    ] as const) {
      const sh = gl.createShader(type)
      if (!sh) throw new Error('createShader failed')
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader')
      gl.attachShader(prog, sh)
    }
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
    gl.useProgram(prog)

    // One triangle that covers the viewport.
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    for (const name of [
      'uLum',
      'uMap',
      'uSize',
      'uMapSize',
      'uMapCount',
      'uTop',
      'uGrain',
      'uSeed',
      'uProgress',
      'uPalette',
    ]) {
      this.u[name] = gl.getUniformLocation(prog, name)
    }
    gl.uniform1i(this.u.uLum, 0)
    gl.uniform1i(this.u.uMap, 1)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1)
  }

  /** True if this method can run on the GPU. */
  supports(method: DitherMethod): boolean {
    return ORDERED_METHODS.includes(method)
  }

  private texture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()
    if (!tex) throw new Error('createTexture failed')
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private mapTexture(method: DitherMethod): { tex: WebGLTexture; size: number } {
    const map = thresholdMapFor(method)
    let tex = this.maps.get(method)
    if (!tex) {
      const gl = this.gl
      const n = map.size * map.size
      // Store each threshold's rank (value × n − 0.5) as 16 bits across R and G, so the 4096 blue-noise ranks survive.
      const bytes = new Uint8Array(n * 4)
      for (let i = 0; i < n; i++) {
        const rank = Math.round(map.values[i] * n - 0.5)
        bytes[i * 4] = rank >> 8
        bytes[i * 4 + 1] = rank & 255
        bytes[i * 4 + 3] = 255
      }
      tex = this.texture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, map.size, map.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
      this.maps.set(method, tex)
    }
    return { tex, size: map.size }
  }

  /** Draw a dithered plate into the hidden canvas's bottom-left `width × height` corner. */
  private draw(lum: ArrayLike<number>, width: number, height: number, opts: GLRenderOptions) {
    const gl = this.gl
    const { method = 'bayer8', grain = 0, seed = 3, progress = 1 } = opts
    const palette = opts.palette ?? palettes.herbarium
    assertPalette(palette)
    if (!this.supports(method)) throw new Error(`${method} cannot run on the GPU`)
    const c = this.canvas
    if (c.width < width || c.height < height) {
      c.width = Math.max(c.width, width)
      c.height = Math.max(c.height, height)
    }
    const bytes = new Uint8Array(width * height)
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(lum[i] * 255)))
    gl.activeTexture(gl.TEXTURE0)
    if (!this.lumTex) this.lumTex = this.texture()
    gl.bindTexture(gl.TEXTURE_2D, this.lumTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes)
    // Unit 1 must be active before mapTexture, which may create (and so bind) a texture.
    gl.activeTexture(gl.TEXTURE1)
    const map = this.mapTexture(method)
    gl.bindTexture(gl.TEXTURE_2D, map.tex)
    gl.activeTexture(gl.TEXTURE0)

    gl.viewport(0, 0, width, height)
    gl.uniform2f(this.u.uSize, width, height)
    gl.uniform1f(this.u.uMapSize, map.size)
    gl.uniform1f(this.u.uMapCount, map.size * map.size)
    gl.uniform1f(this.u.uTop, palette.length - 1)
    gl.uniform1f(this.u.uGrain, grain)
    gl.uniform1f(this.u.uSeed, seed)
    gl.uniform1f(this.u.uProgress, progress)
    const pal = new Float32Array(48)
    palette.forEach((col, i) => pal.set([col[0] / 255, col[1] / 255, col[2] / 255], i * 3))
    gl.uniform3fv(this.u.uPalette, pal)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /** Dither on the GPU and read the result back as RGBA bytes. */
  render(lum: ArrayLike<number>, width: number, height: number, opts: GLRenderOptions = {}): RGBAImage {
    this.draw(lum, width, height, opts)
    const gl = this.gl
    const raw = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
    // GL rows run bottom-up; flip into top-down order.
    const data = new Uint8ClampedArray(raw.length)
    const stride = width * 4
    for (let y = 0; y < height; y++)
      data.set(raw.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride)
    return { width, height, data }
  }

  /** Dither on the GPU and copy straight into a 2D canvas, without a read-back. */
  renderTo(
    target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    lum: ArrayLike<number>,
    width: number,
    height: number,
    opts: GLRenderOptions = {},
  ): void {
    this.draw(lum, width, height, opts)
    const c = this.canvas
    target.drawImage(c, 0, c.height - height, width, height, 0, 0, width, height)
  }

  /** The GPU's renderer string where the browser exposes it (for benchmarks). */
  info(): string {
    const gl = this.gl
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
  }
}

let shared: WebGLDitherRenderer | null | undefined

/** The page's shared renderer, created on first use. Null without WebGL or after context loss. */
export function getWebGLRenderer(): WebGLDitherRenderer | null {
  if (shared !== undefined) return shared && !shared.lost ? shared : null
  try {
    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1)
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    }) as WebGLRenderingContext | null
    if (!gl) return (shared = null)
    const r = new WebGLDitherRenderer(canvas, gl)
    canvas.addEventListener('webglcontextlost', () => {
      r.lost = true
    })
    shared = r
  } catch {
    shared = null
  }
  return shared
}

/** Which path {@link renderAuto} took. */
export type RenderPath = 'webgl' | 'cpu'

/**
 * Render on the GPU when it can (WebGL present, ordered method), else on the
 * CPU. Error diffusion always runs on the CPU.
 */
export function renderAuto(
  lum: ArrayLike<number>,
  width: number,
  height: number,
  opts: RenderOptions = {},
): RGBAImage & { path: RenderPath } {
  const method = opts.method ?? 'bayer8'
  const gl = ORDERED_METHODS.includes(method) ? getWebGLRenderer() : null
  if (gl) {
    try {
      return { ...gl.render(lum, width, height, opts), path: 'webgl' }
    } catch {
      // Fall through to the CPU, e.g. if the context was lost mid-render.
    }
  }
  return { ...renderCPU(lum, width, height, opts), path: 'cpu' }
}
