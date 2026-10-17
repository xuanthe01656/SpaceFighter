import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const sourceFiles = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
    const absolute = path.join(dir,item.name);
    if (item.isDirectory()) walk(absolute);
    else if (/\.(js|jsx|ts|tsx)$/.test(item.name)) sourceFiles.push(absolute);
  }
}
walk(src);
const missing = [];
let total=0;
for (const file of sourceFiles) {
  const code = fs.readFileSync(file,'utf8');
  const re = /(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const match of code.matchAll(re)) {
    total++;
    const name = path.resolve(path.dirname(file),match[1]);
    const candidates = [name,...['.js','.jsx','.ts','.tsx','.css','.json'].map(s=>name+s), ...['index.js','index.jsx','index.ts'].map(s=>path.join(name,s))];
    if (!candidates.some(fs.existsSync)) missing.push(`${path.relative(src,file)} -> ${match[1]}`);
  }
}
console.log(`Import audit: ${sourceFiles.length} source files, ${total} relative imports`);
if (missing.length) {
  for (const x of missing) console.error(`MISSING: ${x}`);
  process.exitCode=1;
} else console.log('All relative import targets exist.');
