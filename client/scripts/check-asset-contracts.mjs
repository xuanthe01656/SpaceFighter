import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ALL_VISUAL_PROFILES, resolveAssetVisual } from '../src/game/assets/AssetRegistry.js';
import { AVAILABLE_ASSET_PATHS } from '../src/game/assets/AssetAvailability.generated.js';
import { isAnimatedBattleKind } from '../src/game/assets/EnemyBossAnimationCatalog.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const strict=process.argv.includes('--release');
const errors=[];
const byKey=new Map();
const allowed=new Set();
for (const p of ALL_VISUAL_PROFILES) {
  if (byKey.has(p.assetId)) errors.push(`Duplicate ${p.assetId}`);
  byKey.set(p.assetId,p);
  for (const filePath of [...Object.values(p.paths),p.legacyIcon].filter(Boolean)) allowed.add(filePath);
}
const approvals=JSON.parse(fs.readFileSync(path.join(root,'assets/visual-art-approvals.json'),'utf8'));
for (const [assetId, review] of Object.entries(approvals.approved||{})) {
  const p=byKey.get(assetId);
  if (!p) {errors.push(`Approval for unknown asset ${assetId}`);continue;}
  const filePath=review.path;
  if (!allowed.has(filePath)) {errors.push(`Unregistered path ${assetId}: ${filePath}`);continue;}
  const abs=path.join(root,'public',filePath.slice(1));
  if (!fs.existsSync(abs)) {errors.push(`Missing approved asset: ${filePath}`);continue;}
  const sum=crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  if (review.sha256!==sum) errors.push(`Checksum changed without review: ${assetId}`);
  if (!review.license || !review.approver) errors.push(`Missing license/approver: ${assetId}`);
}
for (const filePath of AVAILABLE_ASSET_PATHS) {
  if (!allowed.has(filePath)) errors.push(`Unregistered artwork: ${filePath}`);
  const abs=path.join(root,'public',filePath.slice(1));
  if (!fs.existsSync(abs)) errors.push(`Manifest references missing file: ${filePath}`);
  else if (fs.statSync(abs).size > 12 * 1024 * 1024 && !filePath.endsWith('.glb')) errors.push(`Oversized image: ${filePath}`);
}
if (strict) {
  for (const p of ALL_VISUAL_PROFILES.filter(x=>['ship','pilot','equipment','enemy','boss','dungeon_enemy','dungeon_boss'].includes(x.kind))) {
    const r=resolveAssetVisual(p.kind,p.id);
    const reviewed=approvals.approved[p.assetId];
    const art = isAnimatedBattleKind(p.kind) ? (r.atlasSrc || r.topSrc) : (p.kind === 'ship' ? r.topSrc : r.iconSrc);
    if (!art || !reviewed) errors.push(`NOT RELEASE READY: ${p.assetId}`);
  }
}
const counts=Object.fromEntries([...new Set(ALL_VISUAL_PROFILES.map(p=>p.kind))].map(kind=>[kind,ALL_VISUAL_PROFILES.filter(p=>p.kind===kind).length]));
console.log(`Asset contracts ${ALL_VISUAL_PROFILES.length} IDs: ${JSON.stringify(counts)}`);
console.log(`Local art files ${AVAILABLE_ASSET_PATHS.length}, approved ${Object.keys(approvals.approved||{}).length}`);
if (errors.length) {errors.slice(0,25).forEach(x=>console.error('FAIL',x));process.exitCode=1;}
else console.log(strict?'PASS RELEASE ART CONTRACTS':'PASS Asset-Ready development contracts (placeholders allowed)');
