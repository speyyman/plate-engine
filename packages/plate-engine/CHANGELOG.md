# Changelog

## 0.1.0 (2026-10-23)

First release.

- 11 generators (sunburst, sphere, orbits, eye, ridges, medallion, fern, phyllotaxis, branches, chladni, moon) behind one interface, with documented parameters.
- 7 dither methods (threshold, Bayer 2×2, 4×4 and 8×8, blue noise, Floyd–Steinberg, Atkinson), 2 to 16 tones, any palette.
- CPU renderer and a WebGL1 renderer for the ordered methods, pixel-identical on the same input.
- PNG (RGBA, indexed, greyscale) and BMP (1-, 4-, 8- and 24-bit) encoders.
