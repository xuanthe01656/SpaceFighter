import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VISUAL_PROFILES } from '../src/game/assets/AssetRegistry.js';
import { ANIMATED_BATTLE_KINDS, BATTLE_ANIMATION_STATES, validateBattleAtlasContract } from '../src/game/assets/EnemyBossAnimationCatalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const errors = [];
const contracts = ALL_VISUAL_PROFILES.filter(p => ANIMATED_BATTLE_KINDS.includes(p.kind));
const maxFileBytes = 6 * 1024 * 1024;
function webpDimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') throw Error('Not RIFF WebP');
  const fourCC = buffer.toString('ascii', 12, 16);
  if (fourCC === 'VP8X' && buffer.length >= 30) return {
    width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3),
  };
  if (fourCC === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) return {
    width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff,
  };
  if (fourCC === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  throw Error('Unsupported or truncated WebP header');
}
let existingAtlases = 0;
for (const p of contracts) {
  const id = p.assetId;
  const grid = p.visual.atlasGrid;
  if (!p.paths.atlas?.endsWith('_sheet.webp')) errors.push(`${id}: missing canonical animation atlas path`);
  if (!validateBattleAtlasContract(grid, p.visual.animations)) errors.push(`${id}: invalid animation clips or frame indices`);
  if (!p.visual.sockets?.length) errors.push(`${id}: missing weapon socket metadata`);
  for (const state of BATTLE_ANIMATION_STATES) if (!p.visual.animations?.[state]) errors.push(`${id}: missing ${state} state`);
  const source = path.join(root, p.paths.atlas.slice(1));
  if (!fs.existsSync(source)) continue; // A missing art file is normal during asset-ready development.
  existingAtlases++;
  const buf = fs.readFileSync(source);
  if (buf.length > maxFileBytes) errors.push(`${id}: sheet exceeds 6 MiB budget`);
  try {
    const { width, height } = webpDimensions(buf);
    if (width % grid.columns || height % grid.rows || width > 2048 || height > 2048
      || width / grid.columns < 64 || height / grid.rows < 64) {
      errors.push(`${id}: invalid ${width}x${height} sheet dimensions for ${grid.columns}x${grid.rows} frames`);
    }
  } catch (error) { errors.push(`${id}: ${error.message}`); }
}
console.log(`Enemy/Boss animation contracts: ${contracts.length} profiles, ${existingAtlases} delivered atlases, 7 states each`);
if (errors.length) { errors.forEach(error => console.error('FAIL', error)); process.exitCode = 1; }
else console.log('PASS Enemy/Boss animation and attachment contracts (missing art uses procedural fallback)');
