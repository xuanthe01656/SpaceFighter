/** Deterministic background asset release manifest: no timestamp, no Firebase. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_CATALOG_VERSION, BACKGROUND_ART_DIRECTION_VERSION,
  BATTLE_BACKGROUND_CATALOG } from '../src/game/catalog/BackgroundCatalog.js';
import { buildBackgroundAssetManifest } from './lib/background-asset-utils.mjs';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = path.join(clientRoot, 'docs', 'BG3_BACKGROUND_ASSET_MANIFEST.json');
const actual = buildBackgroundAssetManifest(BATTLE_BACKGROUND_CATALOG, path.join(clientRoot,'public'), {
  catalogVersion:BACKGROUND_CATALOG_VERSION, artDirectionVersion:BACKGROUND_ART_DIRECTION_VERSION,
});
const serialized = JSON.stringify(actual, null, 2) + '\n';
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(manifestFile), {recursive:true});
  fs.writeFileSync(manifestFile, serialized);
  console.log(`WRITE ${path.relative(clientRoot, manifestFile)} (${actual.assets.length} assets)`);
} else if (process.argv.includes('--check')) {
  if (!fs.existsSync(manifestFile)) throw new Error('BG3_MANIFEST_NOT_GENERATED: npm run backgrounds:manifest');
  if (fs.readFileSync(manifestFile,'utf8') !== serialized) throw new Error('BG3_ASSET_MANIFEST_STALE: run npm run backgrounds:manifest and review diff');
  console.log(`PASS manifest SHA-256 and dimensions: ${actual.assets.length} assets verified`);
} else {
  console.log(serialized);
}
