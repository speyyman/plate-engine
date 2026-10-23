# Benchmarks

Measured with `npm run bench` (headless) and `node scripts/bench.mjs --headed` on 2026-10-23, on one Windows 11 laptop with Node 24.21 and Chromium from Playwright 1.64.1. Plate: the `moon` generator at phase 0.3, Herbarium palette (three tones). Times are the median of seven runs after one warm-up. WebGL times include uploading the luminance texture and reading the pixels back, which is what a caller that needs the bytes pays; drawing straight into a canvas with `renderTo` skips the read-back.

"Pixels identical" compares the WebGL result with the CPU result on the same 8-bit luminance, cell by cell.

## Headed Chromium, integrated GPU

WebGL renderer: `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)`

| size  | method          | CPU ms | WebGL ms | pixels identical |
| ----- | --------------- | ------ | -------- | ---------------- |
| 256²  | bayer8          | 0.7    | 1.1      | 100.000%         |
| 256²  | blue-noise      | 0.8    | 1.1      | 100.000%         |
| 512²  | bayer8          | 2.6    | 2.7      | 100.000%         |
| 512²  | blue-noise      | 2.8    | 2.7      | 100.000%         |
| 1024² | bayer8          | 11.2   | 9.3      | 100.000%         |
| 1024² | blue-noise      | 11.7   | 8.9      | 100.000%         |
| 1024² | floyd-steinberg | 29.1   | –        | –                |
| 1024² | atkinson        | 35.2   | –        | –                |

## Headless Chromium, SwiftShader (software)

WebGL renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. These are not GPU numbers; they show the path works where there is no GPU.

| size  | method          | CPU ms | WebGL ms | pixels identical |
| ----- | --------------- | ------ | -------- | ---------------- |
| 256²  | bayer8          | 0.7    | 2.5      | 100.000%         |
| 256²  | blue-noise      | 0.7    | 2.0      | 100.000%         |
| 512²  | bayer8          | 2.6    | 6.9      | 100.000%         |
| 512²  | blue-noise      | 3.0    | 5.9      | 100.000%         |
| 1024² | bayer8          | 11.1   | 25.8     | 100.000%         |
| 1024² | blue-noise      | 11.8   | 24.0     | 100.000%         |
| 1024² | floyd-steinberg | 29.4   | –        | –                |
| 1024² | atkinson        | 35.0   | –        | –                |

## What this says

- The ordered dither is cheap on the CPU: about 11 ms for a megapixel. With the read-back included, the integrated GPU only pulls ahead at 1024², by about 20%.
- The GPU path earns its place when the result goes straight to the screen many times a second (the site re-dithers each plate on every frame of its "develop" animation and under the cursor light); there it never reads back and leaves the main thread free.
- Error diffusion is sequential and stays on the CPU, at roughly three times the cost of ordered dither.
- One machine, one run each. Treat the numbers as orders of magnitude, not a ranking of hardware.
