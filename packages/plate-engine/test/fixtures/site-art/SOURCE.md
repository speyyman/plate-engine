# Site art fixture

Verbatim copies of the art code from the speyyman.github.io source, so the golden
tests can prove that `plate-engine` produces the same output as the site.

| File | Copied from | Site commit |
|---|---|---|
| `art/procedural.ts` | `src/art/procedural.ts` | `df15f21d84d21890ea1938e07f06045b288ee5b6` |
| `art/dither.ts` | `src/art/dither.ts` | `df15f21d84d21890ea1938e07f06045b288ee5b6` |
| `lib/moon.ts` | `src/lib/moon.ts` | `df15f21d84d21890ea1938e07f06045b288ee5b6` |

Do not edit these files. To refresh them from a checkout of the site, run
`node scripts/sync-site-fixture.mjs <path-to-site>` from this package.
