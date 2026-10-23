// Packs the library exactly as npm would publish it, installs the tarball into an empty
// project in a temp folder, and uses it from there. Fails if a published file is missing,
// the exports map is wrong, or the installed package cannot draw, dither and encode a plate.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const pkgDir = resolve(import.meta.dirname, '..')
const work = mkdtempSync(join(tmpdir(), 'plate-engine-smoke-'))
const npm = (args, cwd) =>
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  }).toString()

try {
  npm(['pack', '--pack-destination', work], pkgDir)
  const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'))
  if (!tarball) throw new Error('npm pack wrote no tarball')

  const app = join(work, 'app')
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'smoke', private: true, type: 'module' }))
  npm(['install', '--no-audit', '--no-fund', join(work, tarball)], app)

  writeFileSync(
    join(app, 'check.mjs'),
    `import { generate, dither, encodeBMP, grayPalette, DITHER_METHODS } from 'plate-engine'
const lum = generate('fern', 60, 90, { seed: 7 })
const idx = dither(lum, 60, 90, { method: 'atkinson', levels: 4 })
const bmp = encodeBMP(idx, 60, 90, grayPalette(4), 4)
if (bmp[0] !== 0x42 || bmp[1] !== 0x4d) throw new Error('not a BMP')
if (new Set(idx).size < 2) throw new Error('dither produced one tone')
console.log('installed plate-engine works:', DITHER_METHODS.length, 'methods,', bmp.length, 'byte BMP')
`,
  )
  process.stdout.write(execFileSync(process.execPath, ['check.mjs'], { cwd: app }).toString())
} finally {
  rmSync(work, { recursive: true, force: true })
}
