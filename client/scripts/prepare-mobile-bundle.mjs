/**
 * Use only after a successful Vite build, before `npx cap sync`.
 * These two huge optional GLBs are intentionally not auto-loaded in native
 * default graphics. Keep originals in source and regular web development.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRCRAFTS, GEAR_CATALOG } from '../src/constants.js';
import { canAutoLoadModel, PERFORMANCE_PRESETS } from '../src/game/config/PerformanceProfiles.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root,'dist');
if (!fs.existsSync(path.join(dist,'index.html'))) throw Error('dist missing: run npm run build first');
const candidates = [
  AIRCRAFTS.find(x=>x.id==='ship_xwing'),
  GEAR_CATALOG.wingman.find(x=>x.id==='wing_dronelet'),
].filter(Boolean);
if (candidates.length !== 2) throw Error('Optional GLB whitelist changed; review pruning before release');
let total = 0;
for (const model of candidates) {
  const src = model.modelSrc;
  if (!src || !src.startsWith('/models/') || src.includes('..')) throw Error('Invalid model path');
  const bytes = Number(model.modelBytes);
  if (canAutoLoadModel(bytes, PERFORMANCE_PRESETS.mobile) || canAutoLoadModel(bytes, PERFORMANCE_PRESETS.mobileLow))
    throw Error(`${src} is used in native auto mode. Refusing to remove.`);
  const candidate = path.join(dist, src.slice(1));
  if (!fs.existsSync(candidate)) continue;
  const size = fs.statSync(candidate).size;
  if (size < 8 * 1024 * 1024) throw Error(`${src} is small; catalog size estimate out of date`);
  fs.unlinkSync(candidate);
  total += size;
  console.log(`NATIVE OPTIONAL GLB OMITTED ${src}: ${(size/1024/1024).toFixed(1)} MiB`);
}
console.log(`PASS Native asset policy: ${(total/1024/1024).toFixed(1)} MiB of unused optional GLBs omitted from dist; source unchanged.`);
