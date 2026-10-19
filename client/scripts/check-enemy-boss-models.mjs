/** Check delivered Enemy/Boss GLBs without requiring Babylon or network access. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VISUAL_PROFILES } from '../src/game/assets/AssetRegistry.js';
import { ANIMATED_BATTLE_KINDS } from '../src/game/assets/EnemyBossAnimationCatalog.js';

export function inspectBattleGLB(bytes, { maxBytes = 4 * 1024 * 1024, maxTriangles = 25000 } = {}) {
  const errors = [];
  if (!Buffer.isBuffer(bytes) || bytes.length < 28) return ['Invalid or truncated binary GLB'];
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) errors.push('Not a glTF 2.0 binary GLB');
  if (bytes.readUInt32LE(8) !== bytes.length) errors.push('Incorrect binary GLB length');
  if (bytes.length > maxBytes) errors.push(`GLB exceeds ${maxBytes} byte budget`);
  const jsonBytes = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jsonBytes === 0 || jsonBytes % 4 || jsonBytes + 20 > bytes.length) {
    return [...errors, 'Missing or invalid JSON chunk'];
  }
  let json;
  try { json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonBytes).trim()); }
  catch (_) { return [...errors, 'Invalid glTF JSON']; }
  if (!String(json?.asset?.version || '').startsWith('2')) errors.push('glTF asset version must be 2');
  if (!Array.isArray(json.meshes) || json.meshes.length === 0) errors.push('GLB has no meshes');
  if (!Array.isArray(json.nodes) || !json.nodes.length) errors.push('GLB has no scene nodes');
  for (const buff of json.buffers || []) if (buff.uri) errors.push('External or embedded URI buffers are not allowed in a self-contained GLB');
  for (const pic of json.images || []) if (pic.uri) errors.push('External or data-URI images are not allowed; embed images in GLB bufferViews');
  const accessors = json.accessors || [];
  let triangles = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const idx = primitive.indices;
      const position = primitive.attributes?.POSITION;
      if (!Number.isInteger(position) || !accessors[position]) errors.push('Mesh primitive missing POSITION accessor');
      const count = Number.isInteger(idx) && accessors[idx] ? accessors[idx].count : accessors[position]?.count;
      if ((primitive.mode ?? 4) === 4 && Number.isFinite(count)) triangles += count / 3;
    }
  }
  if (triangles > maxTriangles) errors.push(`Model has ${Math.ceil(triangles)} triangles; limit ${maxTriangles}`);
  for (const animation of json.animations || []) {
    if (!animation.name) errors.push('Animation clip without name; cannot map visual states');
  }
  return errors;
}

const main = () => {
  const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  const profiles = ALL_VISUAL_PROFILES.filter(profile => ANIMATED_BATTLE_KINDS.includes(profile.kind));
  let delivered = 0;
  const errors = [];
  for (const profile of profiles) {
    const model = profile.visual.model;
    if (model?.noseAxis !== '-Z' || model?.format !== 'glb' || model?.version !== 2
      || !model?.clips || Object.keys(model.clips).length !== 7) errors.push(`${profile.assetId}: invalid GLB visual contract`);
    const source = path.join(publicRoot, profile.paths.model.slice(1));
    if (!fs.existsSync(source)) continue; // no GLB required during asset-ready development
    delivered++;
    const isBoss = profile.kind.includes('boss');
    try {
      const problems = inspectBattleGLB(fs.readFileSync(source), {
        maxBytes: isBoss ? 8 * 1024 * 1024 : 4 * 1024 * 1024,
        maxTriangles: isBoss ? 60000 : 25000,
      });
      for (const error of problems) errors.push(`${profile.assetId}: ${error}`);
    } catch (error) { errors.push(`${profile.assetId}: ${error.message}`); }
  }
  console.log(`Enemy/Boss GLB contracts: ${profiles.length} profiles; ${delivered} delivered models; desktop cap 6, mobile atlas fallback`);
  if (errors.length) { errors.forEach(err => console.error('FAIL', err)); process.exitCode = 1; }
  else console.log('PASS Enemy/Boss model paths, glTF 2.0 self-contained format and bounded budgets');
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
