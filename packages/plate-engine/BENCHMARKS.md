# Benchmarks

Measured with `npm run bench` (headless) and `node scripts/bench.mjs --headed --no-generators` on 2026-10-23, on one Windows 11 laptop with Node 24.21 and Chromium from Playwright 1.64.1. Plate: the `moon` generator at phase 0.3, Herbarium palette (three tones). Every time in the dither tables is the median of seven runs after one warm-up. WebGL times include uploading the luminance texture and reading the pixels back, which is what a caller that needs the bytes pays; drawing straight into a canvas with `renderTo` skips the read-back.

"Pixels identical" compares the WebGL result with the CPU result on the same 8-bit luminance, cell by cell.

## Headed Chromium, integrated GPU

WebGL renderer: `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)`

| size  | method          | CPU ms | WebGL ms | pixels identical |
| ----- | --------------- | ------ | -------- | ---------------- |
| 256²  | bayer8          | 0.7    | 1.1      | 100.000%         |
| 256²  | blue-noise      | 0.8    | 1.0      | 100.000%         |
| 512²  | bayer8          | 2.6    | 2.6      | 100.000%         |
| 512²  | blue-noise      | 2.9    | 2.6      | 100.000%         |
| 1024² | bayer8          | 11.1   | 10.8     | 100.000%         |
| 1024² | blue-noise      | 11.8   | 8.7      | 100.000%         |
| 1024² | floyd-steinberg | 20.3   | –        | –                |
| 1024² | atkinson        | 26.2   | –        | –                |

## Headless Chromium, SwiftShader (software)

WebGL renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. These are not GPU numbers; they show the path works where there is no GPU.

| size  | method          | CPU ms | WebGL ms | pixels identical |
| ----- | --------------- | ------ | -------- | ---------------- |
| 256²  | bayer8          | 0.7    | 2.4      | 100.000%         |
| 256²  | blue-noise      | 0.7    | 2.3      | 100.000%         |
| 512²  | bayer8          | 2.6    | 6.9      | 100.000%         |
| 512²  | blue-noise      | 3.0    | 5.9      | 100.000%         |
| 1024² | bayer8          | 11.0   | 25.8     | 100.000%         |
| 1024² | blue-noise      | 11.8   | 24.3     | 100.000%         |
| 1024² | floyd-steinberg | 22.4   | –        | –                |
| 1024² | atkinson        | 26.3   | –        | –                |

## Generators

From the same `npm run bench` run, in Node 24.21 (no browser). Seed 7, default parameters, moon at phase 0.3. Median of three after one warm-up. 358 × 483 is the cell grid Plate Studio draws for a 1072 × 1448 panel at 3 px cells.

| generator   | cells       | ms   |
| ----------- | ----------- | ---- |
| sunburst    | 358 × 483   | 24   |
| sphere      | 358 × 483   | 12   |
| orbits      | 358 × 483   | 9    |
| eye         | 358 × 483   | 15   |
| ridges      | 358 × 483   | 1    |
| medallion   | 358 × 483   | 15   |
| fern        | 358 × 483   | 41   |
| phyllotaxis | 358 × 483   | 15   |
| branches    | 358 × 483   | 5    |
| chladni     | 358 × 483   | 17   |
| moon        | 358 × 483   | 592  |
| moon        | 1072 × 1448 | 4856 |

## What this says

- The ordered dither is cheap on the CPU: about 11 ms for a megapixel. With the read-back included, the integrated GPU is level with the CPU up to 512² and pulls ahead only at 1024², and clearly only for blue noise (8.7 ms against 11.8).
- The GPU path earns its place when the result goes straight to the screen many times a second (the site re-dithers each plate on every frame of its "develop" animation and under the cursor light); there it never reads back and leaves the main thread free.
- Error diffusion is sequential and stays on the CPU, at roughly twice the cost of ordered dither.
- Ten of the eleven generators draw a panel-sized grid in under 50 ms. The moon, which shades a lit sphere with craters cell by cell, is the outlier: about 0.6 s at 358 × 483 and 4.9 s at full panel size.
- One machine, one run each. Treat the numbers as orders of magnitude, not a ranking of hardware.
