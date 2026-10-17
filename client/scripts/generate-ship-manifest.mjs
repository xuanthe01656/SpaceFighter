/** Generated manifest: never trust catalog paths alone to imply an asset exists. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRCRAFTS } from '../src/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const dest = path.join(root, 'src/game/rendering/shipAssets.generated.js');
const hasAsset = (value) => typeof value === 'string' && /^\/(?:images|models)\/[\w./-]+$/.test(value)
  && !value.includes('..') && fs.existsSync(path.join(publicDir, value.slice(1)));
function glbMetrics(sourcePath) {
  if (!hasAsset(sourcePath)) return { modelBytes: 0, modelTriangles: 0 };
  const filename = path.join(publicDir, sourcePath.slice(1));
  const modelBytes = fs.statSync(filename).size;
  let fd;
  try {
    fd = fs.openSync(filename, 'r');
    const header = Buffer.alloc(20);
    if (fs.readSync(fd, header, 0, 20, 0) !== 20 || header.toString('ascii', 0, 4) !== 'glTF') {
      return { modelBytes, modelTriangles: 0 };
    }
    const jsonLength = header.readUInt32LE(12);
    if (jsonLength > 16 * 1024 * 1024) throw new Error('GLB JSON exceeds 16 MiB');
    const buffer = Buffer.alloc(jsonLength);
    fs.readSync(fd, buffer, 0, jsonLength, 20);
    const gltf = JSON.parse(buffer.toString('utf8'));
    let modelTriangles = 0;
    for (const mesh of gltf.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
        const count = gltf.accessors?.[accessorIndex]?.count || 0;
        modelTriangles += Math.floor(count / 3);
      }
    }
    return { modelBytes, modelTriangles };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
const rows = AIRCRAFTS.map(a => {
  if (!/^[a-z0-9_]+$/.test(a.id)) throw new Error(`Invalid ship id: ${a.id}`);
  const stats = glbMetrics(a.modelSrc);
  return `  ${JSON.stringify(a.id)}: Object.freeze({ hq: ${hasAsset(a.imgHq)}, top: ${hasAsset(a.imgTop)}, model: ${hasAsset(a.modelSrc)}, modelBytes: ${stats.modelBytes}, modelTriangles: ${stats.modelTriangles} }),`;
});
const source = [
  '/** AUTO-GENERATED from constants.js + public files. Rebuild: npm run generate:ship-assets */',
  'export const SHIP_ASSET_MANIFEST = Object.freeze({',
  ...rows,
  '});',
  '',
].join('\n');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== source) {
    console.error('FAIL ship asset manifest is stale. Run: npm run generate:ship-assets');
    process.exitCode = 1;
  } else {
    console.log(`PASS generated ship manifest matches ${AIRCRAFTS.length} aircraft and actual public assets`);
  }
} else {
  fs.writeFileSync(dest, source);
  console.log(`Generated ${path.relative(root, dest)} for ${AIRCRAFTS.length} ships`);
}
