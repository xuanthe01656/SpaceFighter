import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(base,'src');
const pub = path.join(base,'public');
const strict = process.argv.includes('--strict');
const getFiles = folder => fs.readdirSync(folder,{withFileTypes:true}).flatMap(e => {
  const p = path.join(folder,e.name);
  return e.isDirectory() ? getFiles(p) : [p];
});

const missing = [];
const seen = new Set();
for (const filename of getFiles(src).filter(x => /\.(js|jsx|ts|tsx)$/.test(x))) {
  const txt = fs.readFileSync(filename,'utf8');
  // Only literal references. Dynamic URLs built at runtime need a separate QA pass.
  const re = /['"`]\/(images|models|audio|sounds)\/([^'"`\s]+)['"`]/g;
  for (const match of txt.matchAll(re)) {
    if (match[2].includes('${') || match[2].includes('{')) continue;
    const assetPath = `${match[1]}/${match[2].split('?')[0]}`;
    if (!fs.existsSync(path.join(pub,assetPath))) {
      const from = path.relative(base,filename).split(path.sep).join('/');
      const key = `${from}:/${assetPath}`;
      if (!seen.has(key)) {
        missing.push({ from, asset: '/'+assetPath });
        seen.add(key);
      }
    }
  }
}

missing.sort((a,b) => a.asset.localeCompare(b.asset) || a.from.localeCompare(b.from));
console.log(`Source asset audit: ${missing.length} missing literal references.`);
for (const r of missing) console.log(`  ${r.asset} (in ${r.from})`);
if (strict && missing.length) process.exitCode=1;
