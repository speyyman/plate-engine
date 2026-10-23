import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  encodeBMP,
  encodeGrayPNG,
  encodeIndexedPNG,
  encodePNG,
  generators,
  imageToLuminance,
  moonPhase,
  phaseName,
  toHex,
  toRGBA,
  DITHER_METHODS,
  type BmpBits,
  type GeneratorName,
  type Palette,
} from 'plate-engine'
import { Choice, Dial, Icon, NumberField, Selector, fmt } from './controls'
import { DEVICES, deviceById } from './devices'
import {
  DEFAULTS,
  METHOD_LABELS,
  PALETTE_LABELS,
  fromHash,
  paletteOf,
  planOf,
  toHash,
  type PaletteChoice,
  type State,
} from './state'
import type { RenderJob, RenderResult } from './worker'

type Format = 'png' | 'png-indexed' | 'png-gray' | 'bmp1' | 'bmp4' | 'bmp8' | 'bmp24'

const FORMAT_LABELS: Record<Format, string> = {
  png: 'PNG, full colour',
  'png-indexed': 'PNG, indexed palette',
  'png-gray': 'PNG, 8-bit greyscale',
  bmp1: 'BMP, 1-bit',
  bmp4: 'BMP, 4-bit',
  bmp8: 'BMP, 8-bit',
  bmp24: 'BMP, 24-bit',
}

function formatsFor(s: State, palette: Palette): Format[] {
  const bmp: Format[] = palette.length <= 2 ? ['bmp1', 'bmp4', 'bmp8', 'bmp24'] : ['bmp4', 'bmp8', 'bmp24']
  return s.mode === 'eink' ? ['png-gray', ...bmp.filter((f) => f !== 'bmp24')] : ['png', 'png-indexed', ...bmp]
}

async function encode(format: Format, idx: Uint8Array, w: number, h: number, palette: Palette): Promise<Uint8Array> {
  switch (format) {
    case 'png':
      return encodePNG({ width: w, height: h, data: toRGBA(idx, palette) })
    case 'png-indexed':
      return encodeIndexedPNG(idx, w, h, palette)
    case 'png-gray':
      return encodeGrayPNG(
        Uint8Array.from(idx, (i) => palette[i][0]),
        w,
        h,
      )
    default:
      return encodeBMP(idx, w, h, palette, Number(format.slice(3)) as BmpBits)
  }
}

type Rendered = { indices: Uint8Array; width: number; height: number; ms: number; palette: Palette; label: string }

export function App() {
  const [s, setS] = useState<State>(() => fromHash(location.hash))
  const [image, setImage] = useState<{ bitmap: ImageBitmap; name: string } | null>(null)
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [busy, setBusy] = useState(false)
  const [slip, setSlip] = useState<{ text: string; error?: boolean }>({ text: '' })
  const [format, setFormat] = useState<Format>('png')
  const [over, setOver] = useState(false)
  const [gateSize, setGateSize] = useState({ w: 0, h: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gateRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const jobRef = useRef(0)
  const lumCache = useRef<{ key: string; lum: Float32Array } | null>(null)

  const set = useCallback((patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch })), [])
  const palette = useMemo(() => paletteOf(s), [s])
  const plan = useMemo(() => planOf(s), [s])
  const gen = generators[s.gen]
  const formats = formatsFor(s, palette)
  const fmtNow = formats.includes(format) ? format : formats[0]

  // Keep the URL in step so any plate can be linked.
  useEffect(() => {
    const hash = toHash(s)
    if (hash !== location.hash) history.replaceState(null, '', hash)
  }, [s])

  useEffect(() => {
    const onHash = () => setS((prev) => ({ ...fromHash(location.hash), source: prev.source }))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    const el = gateRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setGateSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Render whenever anything that decides the plate changes.
  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    const id = ++jobRef.current
    let source: RenderJob['source']
    if (s.source === 'image' && image) {
      const key = `${image.name}|${plan.cellsW}x${plan.cellsH}|${s.fit}`
      if (lumCache.current?.key !== key) {
        lumCache.current = { key, lum: imageToLuminance(image.bitmap, plan.cellsW, plan.cellsH, { fit: s.fit }) }
      }
      source = { kind: 'luminance', key, lum: lumCache.current.lum }
    } else {
      source = { kind: 'generator', gen: s.gen, seed: s.seed, params: s.params }
    }
    const job: RenderJob = {
      id,
      source,
      cellsW: plan.cellsW,
      cellsH: plan.cellsH,
      adjust: { brightness: s.brightness, contrast: s.contrast, gamma: s.gamma, invert: s.invert },
      dither: { method: s.method, levels: palette.length, grain: s.grain, seed: s.seed },
      rotate: plan.rotate,
      cell: s.cell,
      outW: plan.outW,
      outH: plan.outH,
    }
    setBusy(true)
    const onMsg = (e: MessageEvent<RenderResult>) => {
      if (e.data.id !== jobRef.current) return
      setBusy(false)
      if (!e.data.ok) {
        setSlip({ text: `Could not render: ${e.data.error}`, error: true })
        return
      }
      const label = s.source === 'image' && image ? image.name : gen.title
      setRendered({
        indices: e.data.indices,
        width: e.data.width,
        height: e.data.height,
        ms: e.data.ms,
        palette,
        label,
      })
    }
    worker.addEventListener('message', onMsg)
    // Let quick slider drags coalesce into one render.
    const t = setTimeout(() => worker.postMessage(job), 30)
    return () => {
      clearTimeout(t)
      worker.removeEventListener('message', onMsg)
    }
  }, [s, image, plan, palette, gen.title])

  // Paint the latest result.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !rendered) return
    c.width = rendered.width
    c.height = rendered.height
    const ctx = c.getContext('2d')
    if (!ctx) return
    const img = new ImageData(rendered.width, rendered.height)
    toRGBA(rendered.indices, rendered.palette, img.data)
    ctx.putImageData(img, 0, 0)
  }, [rendered])

  // Show whole-pixel enlargements crisp; shrink smoothly when the plate is bigger than the gate.
  const display = useMemo(() => {
    if (!rendered || !gateSize.w) return { w: 0, h: 0, up: false }
    const fit = Math.min(gateSize.w / rendered.width, gateSize.h / rendered.height)
    const k = fit >= 1 ? Math.floor(fit) : fit
    return { w: Math.round(rendered.width * k), h: Math.round(rendered.height * k), up: k >= 1 }
  }, [rendered, gateSize])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSlip({ text: `${file.name} is not an image.`, error: true })
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      lumCache.current = null
      setImage({ bitmap, name: file.name })
      set({ source: 'image' })
      setSlip({ text: `Loaded ${file.name}, ${bitmap.width} × ${bitmap.height}. It stays on this device.` })
    } catch {
      setSlip({ text: `Could not read ${file.name}.`, error: true })
    }
  }

  const download = async () => {
    if (!rendered) return
    const bytes = await encode(fmtNow, rendered.indices, rendered.width, rendered.height, rendered.palette)
    const ext = fmtNow.startsWith('png') ? 'png' : 'bmp'
    const base = s.source === 'image' && image ? image.name.replace(/\.[^.]+$/, '') : `${s.gen}-${s.seed}`
    const name = `plate-${base}-${rendered.width}x${rendered.height}.${ext}`
    const url = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: ext === 'png' ? 'image/png' : 'image/bmp' }),
    )
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSlip({
      text: `Saved ${name}, ${rendered.width} × ${rendered.height}, ${rendered.palette.length} tones, ${(bytes.length / 1024).toFixed(1)} KB.`,
    })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setSlip({ text: 'Link copied. It reproduces this plate exactly (your own image is never in the link).' })
    } catch {
      setSlip({ text: 'Copy the address bar to share this plate.' })
    }
  }

  const device = deviceById(s.device)
  const paramValue = (key: string) => {
    const spec = gen.params[key as keyof typeof gen.params] as { default: number | (() => number) }
    return s.params[key] ?? (typeof spec.default === 'function' ? spec.default() : spec.default)
  }
  const setParam = (key: string, v: number) => set({ params: { ...s.params, [key]: v } })

  const altText = rendered
    ? `${rendered.label}, ${METHOD_LABELS[s.method]} dither, ${rendered.width} by ${rendered.height} pixels, ${rendered.palette.length} tones.`
    : 'No plate rendered yet.'

  return (
    <>
      <header className="top">
        <h1>Plate Studio</h1>
        <p>Procedural engravings and your own images, dithered to a few tones and saved for screens or e-paper.</p>
        <nav aria-label="Project">
          <a href="https://speyyman.github.io/plate-engine/docs/">Docs</a>
          <a href="https://github.com/speyyman/plate-engine">Source</a>
        </nav>
      </header>

      <main className="bench">
        <div className="controls">
          <section className="panel stack" aria-labelledby="h-source">
            <h2 id="h-source">Source</h2>
            <Selector
              legend="Draw from"
              value={s.source}
              options={[
                { value: 'generator', label: 'Generator' },
                { value: 'image', label: 'Your image' },
              ]}
              onChange={(v) => set({ source: v })}
            />
            {s.source === 'generator' ? (
              <>
                <Choice
                  label="Generator"
                  value={s.gen}
                  options={(Object.keys(generators) as GeneratorName[]).map((g) => ({
                    value: g,
                    label: generators[g].title,
                  }))}
                  onChange={(g) => set({ gen: g, params: {} })}
                />
                <p className="hint">{gen.description}</p>
                <div className="row">
                  <NumberField
                    label="Seed"
                    value={s.seed}
                    min={0}
                    max={2 ** 31 - 1}
                    onChange={(v) => set({ seed: v })}
                  />
                  <button
                    type="button"
                    className="key"
                    onClick={() => set({ seed: Math.floor(Math.random() * 100000) })}
                  >
                    <Icon.seed /> New seed
                  </button>
                </div>
              </>
            ) : (
              <div
                className={`drop${over ? ' over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(false)
                  void onFile(e.dataTransfer.files[0])
                }}
              >
                <p style={{ margin: '0 0 8px' }}>{image ? image.name : 'Drop an image here, or'}</p>
                <label className="key" style={{ position: 'relative' }}>
                  Choose a file
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                </label>
                <p className="hint" style={{ marginTop: 8 }}>
                  Your image stays on this device. Your browser reads it; nothing is uploaded.
                </p>
              </div>
            )}
          </section>

          {s.source === 'generator' && (
            <section className="panel stack" aria-labelledby="h-params">
              <h2 id="h-params">Parameters</h2>
              {Object.entries(gen.params).map(([key, spec]) => (
                <Dial
                  key={`${s.gen}-${key}`}
                  label={spec.label}
                  value={paramValue(key)}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  hint={spec.description}
                  onChange={(v) => setParam(key, v)}
                />
              ))}
              {s.gen === 'moon' && (
                <div className="row">
                  <button
                    type="button"
                    className="key"
                    onClick={() => {
                      const rest = { ...s.params }
                      delete rest.phase
                      set({ params: rest })
                    }}
                  >
                    Tonight
                  </button>
                  <span className="hint">{phaseName(s.params.phase ?? moonPhase(Date.now()).phase)}</span>
                </div>
              )}
              <button type="button" className="key" onClick={() => set({ params: {} })}>
                Reset parameters
              </button>
            </section>
          )}

          <section className="panel stack" aria-labelledby="h-screen">
            <h2 id="h-screen">Screen</h2>
            <Choice
              label="Dither"
              value={s.method}
              options={DITHER_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
              onChange={(m) => set({ method: m })}
            />
            <Dial
              label="Cell size"
              value={s.cell}
              min={1}
              max={12}
              step={1}
              unit="px"
              onChange={(v) => set({ cell: v })}
            />
            <Dial
              label="Contrast"
              value={s.contrast}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) => set({ contrast: v })}
            />
            <Dial
              label="Brightness"
              value={s.brightness}
              min={-0.5}
              max={0.5}
              step={0.01}
              onChange={(v) => set({ brightness: v })}
            />
            <Dial label="Gamma" value={s.gamma} min={0.3} max={3} step={0.05} onChange={(v) => set({ gamma: v })} />
            <Dial
              label="Grain"
              value={s.grain}
              min={0}
              max={0.5}
              step={0.01}
              hint="Seeded noise added before the dither. The site's plates use 0.06."
              onChange={(v) => set({ grain: v })}
            />
            <Selector
              legend="Tone"
              value={s.invert ? 'neg' : 'pos'}
              options={[
                { value: 'pos', label: 'Positive' },
                { value: 'neg', label: 'Negative' },
              ]}
              onChange={(v) => set({ invert: v === 'neg' })}
            />
          </section>

          <section className="panel stack" aria-labelledby="h-palette">
            <h2 id="h-palette">Palette</h2>
            {s.mode === 'eink' ? (
              <p className="hint">
                E-paper mode prints in {s.greys} greys. Change the panel or its grey levels under Output.
              </p>
            ) : (
              <Choice
                label="Preset"
                value={s.palette}
                options={(Object.keys(PALETTE_LABELS) as PaletteChoice[]).map((p) => ({
                  value: p,
                  label: PALETTE_LABELS[p],
                }))}
                onChange={(p) => set({ palette: p })}
              />
            )}
            <ul className="swatches" aria-label="Palette, darkest first">
              {(s.mode === 'screen' && s.palette === 'custom' ? s.custom : palette.map(toHex)).map((hex, i) => (
                <li key={i}>
                  <span className="chip" style={{ background: /^#[\da-f]{6}$/i.test(hex) ? hex : 'transparent' }} />
                  {s.mode === 'screen' && s.palette === 'custom' ? (
                    <input
                      type="text"
                      aria-label={`Tone ${i + 1} colour`}
                      value={hex}
                      spellCheck={false}
                      onChange={(e) => {
                        const next = [...s.custom]
                        next[i] = e.target.value
                        set({ custom: next })
                      }}
                    />
                  ) : (
                    <span className="mono">{hex}</span>
                  )}
                </li>
              ))}
            </ul>
            {s.mode === 'screen' && s.palette === 'custom' && (
              <div className="row">
                <button
                  type="button"
                  className="key"
                  disabled={s.custom.length >= 16}
                  onClick={() => set({ custom: [...s.custom, '#808080'] })}
                >
                  Add tone
                </button>
                <button
                  type="button"
                  className="key"
                  disabled={s.custom.length <= 2}
                  onClick={() => set({ custom: s.custom.slice(0, -1) })}
                >
                  Remove tone
                </button>
              </div>
            )}
            {s.mode === 'screen' && s.palette === 'custom' && (
              <p className="hint">Darkest first. Two to sixteen tones, as hex.</p>
            )}
          </section>

          <section className="panel stack" aria-labelledby="h-output">
            <h2 id="h-output">Output</h2>
            <Selector
              legend="For"
              value={s.mode}
              options={[
                { value: 'screen', label: 'Screen' },
                { value: 'eink', label: 'E-paper' },
              ]}
              onChange={(m) =>
                set(
                  m === 'eink'
                    ? { mode: m, greys: device.greys, width: device.width, height: device.height }
                    : { mode: m, width: DEFAULTS.width, height: DEFAULTS.height },
                )
              }
            />
            {s.mode === 'eink' && (
              <>
                <Choice
                  label="Panel"
                  value={s.device}
                  options={DEVICES.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={(id) => {
                    const d = deviceById(id)
                    set({ device: id, greys: d.greys, width: d.width, height: d.height })
                  }}
                />
                <p className="hint">{device.note}</p>
                <Selector
                  legend="Grey levels"
                  value={s.greys}
                  options={[2, 4, 16].map((g) => ({ value: g, label: String(g) }))}
                  onChange={(g) => set({ greys: g })}
                />
                <Selector
                  legend="Rotate"
                  value={s.rotate}
                  options={[0, 1, 2, 3].map((r) => ({ value: r, label: `${r * 90}°` }))}
                  onChange={(r) => set({ rotate: r })}
                />
              </>
            )}
            {(s.mode === 'screen' || device.editable) && (
              <div className="row">
                <NumberField label="Width px" value={s.width} min={16} max={4096} onChange={(v) => set({ width: v })} />
                <NumberField
                  label="Height px"
                  value={s.height}
                  min={16}
                  max={4096}
                  onChange={(v) => set({ height: v })}
                />
              </div>
            )}
            {s.source === 'image' && (
              <Selector
                legend="Fit"
                value={s.fit}
                options={[
                  { value: 'cover', label: 'Fill and crop' },
                  { value: 'contain', label: 'Fit inside' },
                ]}
                onChange={(f) => set({ fit: f })}
              />
            )}
            <p className="hint">
              {plan.outW} × {plan.outH} px from a {plan.cellsW} × {plan.cellsH} cell drawing.
            </p>
          </section>

          <section className="panel stack" aria-labelledby="h-export">
            <h2 id="h-export">Export</h2>
            <Choice
              label="Format"
              value={fmtNow}
              options={formats.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
              onChange={setFormat}
            />
            <button type="button" className="expose" onClick={() => void download()} disabled={!rendered || busy}>
              <Icon.download /> Download
            </button>
            <button type="button" className="key" onClick={() => void copyLink()}>
              Copy link to this plate
            </button>
            {s.mode === 'eink' && (
              <p className="hint">
                Many e-readers that allow a custom sleep screen read a PNG or BMP at the panel&apos;s native size. Your
                reader&apos;s manual says which formats it accepts and which folder to copy the file into; check it
                first.
              </p>
            )}
          </section>

          <p className="foot">
            Built on <a href="https://github.com/speyyman/plate-engine">plate-engine</a>, MIT licensed. Works offline
            once loaded. Made by <a href="https://speyyman.github.io/">Saeed Peyman</a>.
          </p>
        </div>

        <div className="gate-col">
          <div className="gate" ref={gateRef} aria-busy={busy}>
            {busy && <div className="exposure" aria-hidden="true" />}
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={altText}
              className={display.up ? 'up' : undefined}
              style={display.w ? { width: display.w, height: display.h } : undefined}
            />
          </div>
          <div className="readout" aria-live="polite">
            <span>
              <b>{rendered ? `${rendered.width} × ${rendered.height}` : '…'}</b> px
            </span>
            <span>
              <b>{palette.length}</b> tones
            </span>
            <span>
              <b>{METHOD_LABELS[s.method]}</b>
            </span>
            <span>
              {busy ? (
                <span className="exposing-word">Exposing</span>
              ) : rendered ? (
                `CPU worker, ${fmt(rendered.ms, 1)} ms`
              ) : (
                ''
              )}
            </span>
          </div>
          <p className={`slip${slip.error ? ' error' : ''}`} role="status">
            {slip.text}
          </p>
        </div>
      </main>
    </>
  )
}
