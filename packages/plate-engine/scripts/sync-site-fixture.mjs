// Copy the site's art code into test/fixtures/site-art and record the commit it came from.
// Usage: node scripts/sync-site-fixture.mjs <path-to-site-checkout>
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = process.argv[2]
if (!site) {
  console.error('usage: node scripts/sync-site-fixture.mjs <path-to-site-checkout>')
  process.exit(1)
}
const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'test', 'fixtures', 'site-art')
const files = [
  ['src/art/procedural.ts', 'art/procedural.ts'],
  ['src/art/dither.ts', 'art/dither.ts'],
  ['src/lib/moon.ts', 'lib/moon.ts'],
]
const commit = execFileSync('git', ['-C', site, 'log', '-1', '--format=%H', '--', ...files.map((f) => f[0])])
  .toString()
  .trim()
const rows = []
for (const [from, to] of files) {
  mkdirSync(dirname(join(out, to)), { recursive: true })
  copyFileSync(join(site, from), join(out, to))
  rows.push(`| \`${to}\` | \`${from}\` | \`${commit}\` |`)
}
writeFileSync(
  join(out, 'SOURCE.md'),
  `# Site art fixture

Verbatim copies of the art code from the speyyman.github.io source, so the golden
tests can prove that \`plate-engine\` produces the same output as the site.

| File | Copied from | Site commit |
|---|---|---|
${rows.join('\n')}

Do not edit these files. To refresh them from a checkout of the site, run
\`node scripts/sync-site-fixture.mjs <path-to-site>\` from this package.
`,
)
console.log(`copied ${files.length} files from ${site} at ${commit}`)
