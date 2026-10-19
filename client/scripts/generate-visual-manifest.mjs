import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VISUAL_PROFILES } from '../src/game/assets/AssetRegistry.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const output = path.join(root, 'src/game/assets/AssetAvailability.generated.js');
const paths = new Set();
for (const profile of ALL_VISUAL_PROFILES) {
  for (const name of [...Object.values(profile.paths), profile.legacyIcon].filter(Boolean)) {
    // Only local public paths are permitted; never crawl external URLs.
    if (!/^\/[a-zA-Z0-9_./-]+$/.test(name) || name.includes('..')) throw Error(`Unsafe art path: ${name}`);
    if (fs.existsSync(path.join(pub, name.slice(1)))) paths.add(name);
  }
}
const contents = `// GENERATED: run \`npm run assets:manifest\` after adding artwork.\nexport const AVAILABLE_ASSET_PATHS = Object.freeze(${JSON.stringify([...paths].sort(),null,2)});\n`.replaceAll('\\n','\n');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output,'utf8') !== contents) {
    console.error('FAIL Visual availability manifest is stale. Run npm run assets:manifest.'); process.exit(1);
  }
  console.log(`PASS Asset availability manifest (${paths.size} existing catalog art paths)`);
} else {
  fs.writeFileSync(output, contents);
  console.log(`Generated ${paths.size} existing catalog art paths`);
}
