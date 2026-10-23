// Benchmark the CPU and WebGL dither renderers in one Chromium page, and check
// that they agree. Run after `npm run build` (the `bench` script does both).
//
//   node scripts/bench.mjs            # headless: WebGL runs on SwiftShader, a CPU emulation
//   node scripts/bench.mjs --headed   # headed: WebGL runs on this machine's GPU, if Chromium can use it
//   node scripts/bench.mjs --no-generators   # skip the generator timings (CI)
//
// The renderer string is printed with the results; headless numbers are not GPU numbers.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url))
const types = { '.js': 'text/javascript', '.html': 'text/html', '.map': 'application/json' }
const page = `<!doctype html><meta charset="utf-8"><script type="module">
import * as pe from './dist/index.js'
window.bench = async () => {
  const out = { renderer: null, rows: [] }
  const gl = pe.getWebGLRenderer()
  // Median of seven runs after one warm-up, for every row.
  const time = (fn) => { fn(); const t = []; for (let i = 0; i < 7; i++) { const a = performance.now(); fn(); t.push(performance.now() - a) } t.sort((x, y) => x - y); return t[3] }
  out.renderer = gl ? gl.info() : 'none'
  for (const size of [256, 512, 1024]) {
    // 8-bit luminance on both paths, since the GPU path uploads an 8-bit texture.
    const lum = Float32Array.from(pe.generate('moon', size, size, { params: { phase: 0.3 } }), (v) => Math.round(v * 255) / 255)
    for (const method of ['bayer8', 'blue-noise']) {
      const opts = { method, palette: pe.palettes.herbarium }
      const cpuMs = time(() => pe.renderCPU(lum, size, size, opts))
      const row = { size, method, cpuMs, glMs: null, agree: null }
      if (gl) {
        row.glMs = time(() => gl.render(lum, size, size, opts))
        const a = pe.renderCPU(lum, size, size, opts).data
        const b = gl.render(lum, size, size, opts).data
        let same = 0
        for (let i = 0; i < a.length; i += 4) if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) same++
        row.agree = same / (a.length / 4)
      }
      out.rows.push(row)
    }
  }
  for (const method of ['floyd-steinberg', 'atkinson']) {
    const lum = pe.generate('moon', 1024, 1024, { params: { phase: 0.3 } })
    const cpuMs = time(() => pe.renderCPU(lum, 1024, 1024, { method, palette: pe.palettes.herbarium }))
    out.rows.push({ size: 1024, method, cpuMs, glMs: null, agree: null })
  }
  return out
}
</script>`

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(page)
  const file = normalize(join(root, path))
  if (!file.startsWith(root)) return res.writeHead(403).end()
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((r) => server.listen(0, r))
const url = `http://localhost:${server.address().port}/`

const headed = process.argv.includes('--headed')
const browser = await chromium.launch({
  headless: !headed,
  args: headed ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const tab = await browser.newPage()
await tab.goto(url)
await tab.waitForFunction(() => typeof window.bench === 'function')
const result = await tab.evaluate(() => window.bench())
await browser.close()
server.close()

const fmt = (v) => (v === null ? '–' : v.toFixed(1))
console.log(`Chromium ${headed ? 'headed' : 'headless'}; WebGL renderer: ${result.renderer}`)
console.log(
  '| size | method | CPU ms (median of 7) | WebGL ms (median of 7, incl. upload and read-back) | pixels identical |',
)
console.log('|---|---|---|---|---|')
for (const r of result.rows) {
  console.log(
    `| ${r.size}² | ${r.method} | ${fmt(r.cpuMs)} | ${fmt(r.glMs)} | ${r.agree === null ? '–' : (r.agree * 100).toFixed(3) + '%'} |`,
  )
}

// Generators, in Node: every one at the cell grid Plate Studio draws for a 1072 × 1448 panel at
// 3 px cells (358 × 483), and the moon, the slowest, at the full panel size. Median of three after a warm-up.
if (!process.argv.includes('--no-generators')) {
  const pe = await import(new URL('../dist/index.js', import.meta.url).href)
  const med3 = (fn) => {
    fn()
    const t = []
    for (let i = 0; i < 3; i++) {
      const a = performance.now()
      fn()
      t.push(performance.now() - a)
    }
    return t.sort((x, y) => x - y)[1]
  }
  console.log(`\nGenerators in Node ${process.version} (seed 7, default parameters, moon at phase 0.3)`)
  console.log('| generator | cells | ms (median of 3) |')
  console.log('|---|---|---|')
  const jobs = Object.keys(pe.generators).map((name) => [name, 358, 483])
  jobs.push(['moon', 1072, 1448])
  for (const [name, w, h] of jobs) {
    const params = name === 'moon' ? { phase: 0.3 } : undefined
    const ms = med3(() => pe.generate(name, w, h, { seed: 7, params }))
    console.log(`| ${name} | ${w} × ${h} | ${ms.toFixed(0)} |`)
  }
}

// Fail if WebGL is missing or disagrees with the CPU anywhere, so CI can use this as the WebGL test.
const bad = result.renderer === 'none' || result.rows.some((r) => r.agree !== null && r.agree < 1)
if (bad) {
  console.error('WebGL output differs from the CPU output (or WebGL is unavailable).')
  process.exit(1)
}
