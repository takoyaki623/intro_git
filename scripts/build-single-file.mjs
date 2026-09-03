#!/usr/bin/env node
/**
 * Fold `npm run build` output into one self-contained HTML file.
 *
 * Written for publishing as a Claude Artifact, where the host supplies
 * <!doctype>, <head> and <body> and the file holds page content only. It works
 * anywhere a single file is easier to move around than a dist/ directory.
 *
 *   npm run build:single [-- out.html]
 *
 * Everything ships inline. The webfonts are the one external request, and the
 * app injects that itself at startup (see src/ui/fonts.ts) so a slow font host
 * cannot hold up the first paint.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const out = process.argv[2] ?? 'pokemon-battle.html'

const html = readFileSync(join(DIST, 'index.html'), 'utf8')

const find = (pattern, what) => {
  const match = html.match(pattern)
  if (!match) {
    throw new Error(`no ${what} in ${DIST}/index.html -- run npm run build first`)
  }
  return match[1]
}

const css = readFileSync(
  join(DIST, find(/href="\/(assets\/[^"]+\.css)"/, 'stylesheet')),
  'utf8',
)
const js = readFileSync(join(DIST, find(/src="\/(assets\/[^"]+\.js)"/, 'script')), 'utf8')
writeFileSync(
  out,
  `<title>ポケモンバトル</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`,
  'utf8',
)

console.log(`${out}  ${(readFileSync(out).length / 1024).toFixed(0)} KB`)
