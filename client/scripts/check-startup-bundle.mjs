/**
 * Post-build bundle report for Graphics 2.1.6.
 * Does not guess savings: reads the actual Vite output from dist/.
 * Run npm run build && npm run check:bundle on the release workstation.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const base = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(base, 'dist');
const htmlFile = join(dist, 'index.html');
if (!existsSync(htmlFile)) {
  console.error('Missing dist/index.html; run npm run build first.');
  process.exit(1);
}
const html = readFileSync(htmlFile, 'utf8');
const assets = join(dist, 'assets');
if (!existsSync(assets)) throw new Error('Missing dist/assets after Vite build');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/g)].map(x => x[1]);
if (!scripts.length) throw new Error('No startup script found in dist/index.html');
const normalize = ref => decodeURIComponent(ref).replace(/^(?:\.\/|\/)+/, '');
const entryFiles = scripts.map(ref => {
  const name = normalize(ref);
  if (name.includes('..') || /^(?:https?:)?\/\//.test(ref)) {
    throw new Error(`Unexpected external/unsafe entry script ${ref}`);
  }
  const filename = join(dist, name);
  if (!existsSync(filename)) throw new Error(`Missing Vite startup chunk ${ref}`);
  return filename;
});
const jsChunks = readdirSync(assets).filter(name => name.endsWith('.js'))
  .map(name => {
    const filename = join(assets, name);
    const content = readFileSync(filename);
    return { name, bytes: content.length, gzip: gzipSync(content, { level: 6 }).length };
  });
const startup = entryFiles.map(filename => {
  const content = readFileSync(filename);
  return { name: filename.slice(dist.length + 1), bytes: content.length, gzip: gzipSync(content, { level: 6 }).length };
});
const toKib = bytes => (bytes / 1024).toFixed(1);
console.log(`Startup JS: ${startup.map(x => `${x.name}: ${toKib(x.bytes)} KiB raw / ${toKib(x.gzip)} KiB gzip`).join(', ')}`);
console.log(`Total JS chunks: ${jsChunks.length}; sizes across all screens: ${toKib(jsChunks.reduce((n,x)=>n+x.bytes,0))} KiB raw.`);
console.log('Largest chunks (lazy chunks may be larger than the initial entry):');
for (const c of jsChunks.sort((a,b)=>b.bytes-a.bytes).slice(0, 6)) {
  console.log(`  ${c.name}: ${toKib(c.bytes)} KiB raw / ${toKib(c.gzip)} KiB gzip`);
}
for (const name of ['portal_landscape.png', 'portal_portrait.png']) {
  const asset = join(dist, 'images', name);
  if (!existsSync(asset)) throw new Error(`Portal image absent from output: ${asset}`);
  console.log(`PASS Portal asset ${name}: ${toKib(statSync(asset).size)} KiB copied`);
}
console.log('PASS bundle output available for release review. Validate initial Network waterfall and every lazy screen in the browser.');
