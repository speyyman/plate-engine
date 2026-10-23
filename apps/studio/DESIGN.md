# Copyboard: the design system of Plate Studio

## Concept

A print shop's camera room, around 1960. Artwork was pinned to the copyboard, shot through a halftone screen onto film, and checked on the ground glass under an amber safelight before anyone committed a plate. Plate Studio does the same job in a browser: an image goes on the board (a generator or your own picture), you choose the screen (the dither), and you take the film away (a PNG or BMP). So the interface is the camera's control panel. A dark room, so the image is the brightest thing in it. Machined graphite panels. Engraved, condensed labels, like the lettering on lens barrels and timers. Monospaced readouts for every number. One safelight amber that marks only what you can touch or what is active.

## Tokens

All tokens live in `src/tokens.css` as CSS custom properties. Every screen is built from them.

### Colour

| Token           | Hex       | Role                                                         |
| --------------- | --------- | ------------------------------------------------------------ |
| `--cb-room`     | `#17181a` | Page background, the darkroom                                |
| `--cb-panel`    | `#212327` | Control panels                                               |
| `--cb-raised`   | `#2b2e33` | Inputs, buttons, raised controls                             |
| `--cb-rule`     | `#3d4148` | Decorative dividers only (not control edges)                 |
| `--cb-edge`     | `#7a7f88` | Borders of interactive controls                              |
| `--cb-text`     | `#ece9e2` | Primary text                                                 |
| `--cb-dim`      | `#a9a59b` | Secondary text, units, hints                                 |
| `--cb-amber`    | `#f2a93b` | Safelight: focus rings, active state, the one primary button |
| `--cb-on-amber` | `#17181a` | Text on amber                                                |
| `--cb-film`     | `#0b0c0d` | Behind the image in the film gate                            |
| `--cb-alert`    | `#ef8f86` | Errors and refusals                                          |

Contrast (WCAG 2 relative luminance, computed with `plate-engine`'s `relativeLuminance`):

| Pair              | Ratio | Use                                   |
| ----------------- | ----- | ------------------------------------- |
| text on room      | 14.65 | body                                  |
| text on panel     | 12.98 | body                                  |
| text on raised    | 11.24 | button labels                         |
| dim on room       | 7.23  | hints                                 |
| dim on panel      | 6.40  | hints                                 |
| dim on raised     | 5.54  | units inside inputs                   |
| amber on room     | 8.89  | active labels, focus                  |
| amber on panel    | 7.88  | active labels                         |
| on-amber on amber | 8.89  | primary button                        |
| alert on panel    | 6.70  | error text                            |
| edge on panel     | 3.91  | control borders (non-text, needs 3:1) |
| edge on raised    | 3.39  | control borders (non-text, needs 3:1) |

Every text pair passes AA (4.5:1) and most pass AAA (7:1). Control edges pass the 3:1 non-text minimum.

### Type

Two freely licensed fonts (SIL Open Font License), self-hosted through `@fontsource`, Latin subset only:

- **Barlow Semi Condensed** 500 and 600, for labels, headings and buttons. Its narrow, DIN-like construction recalls the engraved lettering on lens barrels and process timers, and it fits long labels into a 320 px control column without shrinking.
- **IBM Plex Mono** 400 and 500, for every number and readout (seed, sizes, parameter values, file names). Fixed widths keep values from jittering as you drag a dial.

Scale (px / line height): 12/16 caption, 13/18 label, 15/22 body, 18/24 section, 24/28 title. Labels are uppercase with 0.06em tracking; values are never uppercase.

### Space, shape, depth

- Spacing on a 4 px base: 4, 8, 12, 16, 24, 32, 48.
- Radius 2 px everywhere (machined edges). Range thumbs are the only round shapes, like knobs.
- Borders 1 px: `--cb-edge` for controls, `--cb-rule` for dividers.
- No drop shadows. Panels read as machined plates through a 1 px inset highlight on the top edge (`inset 0 1px 0 #ffffff0d`). The film gate is the only "lit" surface.

## Motion

- State changes (hover, press, selection) take 120 ms, ease-out. Nothing moves for decoration.
- While a plate renders, a thin exposure bar runs along the top of the film gate. With `prefers-reduced-motion: reduce` the bar is replaced by the word "Exposing" and no transitions run.
- Never animate the image itself. What you see is what you will download.

## Iconography

Text first. Where an icon helps (rotate, download, new seed), it is an inline SVG drawn on a 16 px grid with a 1.5 px stroke in `currentColor`, square caps, no fills. No emoji, no icon font.

## Core components

1. **Dial**: a labelled range input with a monospaced readout and its unit. Arrow keys step, Page Up/Down step ×10, Home/End jump to the ends.
2. **Selector**: a row of radio buttons styled as a segmented switch, for dither method, fit, rotation and mode. Selected segment is amber text on raised with an amber underline.
3. **Swatch strip**: the palette as a row of chips, darkest first, each with its hex code. Custom palettes are typed as hex, one per chip.
4. **Film gate**: the preview. Image on `--cb-film`, scaled by whole pixels with `image-rendering: pixelated`, a faint ground-glass grid in the margin, and a readout of pixel size, tones and renderer underneath.
5. **Exposure button**: the single primary action on a panel (download). Amber fill. Every other button is a raised graphite key.
6. **Slip**: a one-line status strip under the gate for what just happened ("Saved plate-fern-7.bmp, 1072 × 1448, 16 greys") and for errors in `--cb-alert`.

## Rules

1. Never use amber for anything that is not interactive or active. If it is amber, you can press it, or it is the thing currently selected or focused.
2. Never put text, marks or decoration on top of the image. The film gate shows only what will be exported.
3. Never round, blur or shadow. No gradients, no translucent glass, no corner radius above 2 px except range knobs.

## Accessibility

- AA contrast for all text (table above); 3:1 for control edges.
- Visible focus: a 2 px amber outline with 2 px offset on every focusable element, never removed.
- Reduced motion: no transitions, no exposure animation.
- 375 px: the film gate stacks above the controls; every control stays reachable by keyboard and at least 40 px tall for touch.
- The preview canvas has a text alternative that names the generator, method, size and tone count.

## Relation to other systems

Plate Studio is a tool, not part of speyyman.github.io, so it shares nothing with the site's Herbarium system (no forest or parchment, no plate frames or registration marks, no Big Shoulders or Geist Mono). The Herbarium palette appears only as one selectable preset, because it is a real palette people may want to reproduce.
