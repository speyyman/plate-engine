import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

/** Parse a BMP header and colour table; return size, depth and palette as hex. */
function bmpInfo(buf: Buffer) {
  expect(buf.subarray(0, 2).toString('latin1')).toBe('BM')
  expect(buf.readUInt32LE(2)).toBe(buf.length)
  const width = buf.readInt32LE(18)
  const height = buf.readInt32LE(22)
  const bits = buf.readUInt16LE(28)
  const used = buf.readUInt32LE(46)
  const colours: string[] = []
  for (let i = 0; i < used; i++) {
    const o = 54 + i * 4
    colours.push('#' + [buf[o + 2], buf[o + 1], buf[o]].map((v) => v.toString(16).padStart(2, '0')).join(''))
  }
  const offset = buf.readUInt32LE(10)
  const rowBytes = Math.ceil((width * bits) / 32) * 4
  expect(offset + rowBytes * height).toBe(buf.length)
  // Every pixel index must point into the colour table.
  const indices = new Set<number>()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = offset + y * rowBytes
      const v =
        bits === 8
          ? buf[row + x]
          : bits === 4
            ? (buf[row + (x >> 1)] >> (x & 1 ? 0 : 4)) & 15
            : (buf[row + (x >> 3)] >> (7 - (x & 7))) & 1
      indices.add(v)
    }
  }
  for (const i of indices) expect(i).toBeLessThan(used)
  return { width, height, bits, colours, used: indices.size }
}

async function rendered(page: Page) {
  await expect(page.getByText(/CPU worker, \d+ ms/)).toBeVisible({ timeout: 30_000 })
}

async function download(page: Page) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ])
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path())!) }
}

test('changes generator, exports an indexed PNG and a 4-bit BMP that decode correctly', async ({ page }) => {
  await page.goto('./')
  await rendered(page)
  await page.getByRole('combobox', { name: 'Generator' }).selectOption('phyllotaxis')
  await expect(page).toHaveURL(/g=phyllotaxis/)
  await page.getByRole('combobox', { name: 'Dither' }).selectOption('atkinson')
  await page.getByLabel('Width px').fill('300')
  await page.getByLabel('Height px').fill('200')
  await rendered(page)
  await expect(
    page.getByRole('img', { name: /Phyllotaxis, Atkinson dither, 300 by 200 pixels, 3 tones/ }),
  ).toBeVisible()

  await page.getByRole('combobox', { name: 'Format' }).selectOption('png-indexed')
  const png = await download(page)
  expect(png.name).toBe('plate-phyllotaxis-7-300x200.png')
  const img = PNG.sync.read(png.bytes)
  expect([img.width, img.height]).toEqual([300, 200])
  const seen = new Set<string>()
  for (let i = 0; i < img.data.length; i += 4) seen.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`)
  // Herbarium: forest, moss, bone, and nothing else.
  expect([...seen].sort()).toEqual(['20,42,31', '236,228,208', '79,122,90'])

  await page.getByRole('combobox', { name: 'Format' }).selectOption('bmp4')
  const bmp = await download(page)
  const info = bmpInfo(bmp.bytes)
  expect(info).toMatchObject({ width: 300, height: 200, bits: 4, colours: ['#142a1f', '#4f7a5a', '#ece4d0'] })
})

test('e-paper mode exports a full-size 16-grey BMP for a preset panel', async ({ page }) => {
  await page.goto('./#g=moon&p.phase=0.3')
  await rendered(page)
  await page.getByRole('radio', { name: 'E-paper' }).check()
  await page.getByRole('combobox', { name: 'Panel' }).selectOption('kobo-clara-bw')
  await page.getByRole('combobox', { name: 'Format' }).selectOption('bmp8')
  await rendered(page)
  const bmp = await download(page)
  const info = bmpInfo(bmp.bytes)
  expect(info.width).toBe(1072)
  expect(info.height).toBe(1448)
  expect(info.bits).toBe(8)
  expect(info.colours).toHaveLength(16)
  expect(info.colours[0]).toBe('#000000')
  expect(info.colours[15]).toBe('#ffffff')
  expect(info.used).toBeGreaterThan(8)

  // Rotating a quarter turn swaps nothing in the file size: the panel stays portrait.
  await page.getByRole('radio', { name: '90°' }).check()
  await page.getByRole('combobox', { name: 'Format' }).selectOption('png-gray')
  await rendered(page)
  const png = await download(page)
  const img = PNG.sync.read(png.bytes)
  expect([img.width, img.height]).toEqual([1072, 1448])
})

test('a shared link reproduces the same plate', async ({ page, browser }) => {
  await page.goto('./#g=chladni&s=11&p.n=3&p.m=7&m=blue-noise&pal=oneBit&w=240&h=240')
  await rendered(page)
  await page.getByRole('combobox', { name: 'Format' }).selectOption('png')
  const a = await download(page)
  const other = await browser.newPage()
  await other.goto(page.url())
  await rendered(other)
  await other.getByRole('combobox', { name: 'Format' }).selectOption('png')
  const b = await download(other)
  expect(Buffer.compare(a.bytes, b.bytes)).toBe(0)
  await other.close()
})

test('keeps working offline after the first load', async ({ page, context }) => {
  await page.goto('./')
  await rendered(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await rendered(page)
  await context.setOffline(true)
  await page.reload()
  await rendered(page)
  await expect(page.getByRole('heading', { name: 'Plate Studio' })).toBeVisible()
  await context.setOffline(false)
})

test('is usable at 375 px with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('./')
  await rendered(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  const gen = page.getByRole('combobox', { name: 'Generator' })
  await gen.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page).not.toHaveURL(/g=fern/)
})
