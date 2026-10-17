import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRCRAFTS } from '../src/constants.js';
import { resolveShipVisual } from '../src/game/rendering/ShipVisualCatalog.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative),'utf8');
const campaign = read('src/components/Campaign/CampaignScene.js');
const dungeon = read('src/components/Dungeon/DungeonScene.js');
const factory = read('src/game/rendering/ShipVisualFactory.js');
const hq = read('src/components/HQ/index.jsx');
const inventory = read('src/components/Inventory/index.jsx');
const modal = read('src/components/ItemModal/ItemModal.jsx');
const tests = [
 ['Both battle scenes use shared ShipVisualFactory', [campaign,dungeon].every(s=>/createPlayerShipVisual\(scene, playerRoot/.test(s))],
 ['No separate player GLB importer remains in Campaign', !/ImportMeshAsync\('', aircraftBase\.modelSrc/.test(campaign)],
 ['Dungeon no longer constructs playerPlane directly', !/const playerPlane\s*=\s*BABYLON\.MeshBuilder/.test(dungeon)],
 ['Dungeon collision uses stable independent ship hitbox', /eb\.intersectsMesh\(shipVisual\.collider/.test(dungeon)&&/e\.mesh\.intersectsMesh\(shipVisual\.collider/.test(dungeon)],
 ['Ship visual blink and death work for both 2D and 3D', /shipVisual\.setVisibility\(0\)/.test(dungeon) && /shipVisual\.setVisibility\(1\)/.test(dungeon)],
 ['GLB import completion checks scene lifecycle', /disposed \|\| gone\(scene\)/.test(factory)&&/onDisposeObservable\.addOnce/.test(factory)],
 ['Both 2D sprite and hitbox lie flat, sprite nose towards -Z', (factory.match(/rotation\.x = -Math\.PI \/ 2/g)||[]).length===2],
 ['Ship factory uses generated manifest to skip missing asset requests', /visual\.topSrc/.test(factory) && /visual\.modelSrc/.test(factory)],
 ['HQ preview uses catalog ID not first ship fallback image', /<ShipImage aircraftId=\{loadout\.aircraft\}/.test(hq)],
 ['HQ prevents launching an invalid aircraft', /Invalid selected aircraft!/.test(hq)],
 ['Inventory and modal use same ship image component', [inventory,modal].every(s=>/ShipImage/.test(s))],
 ['Progress/battle server authority remains separate from visuals', !/saveUserProfile\(|gameAction\(|battle\.finish|setDoc\(/.test(factory)],
];
let failed = 0;
for (const [name, ok] of tests) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
const missing = AIRCRAFTS.filter(a=>resolveShipVisual(a.id,AIRCRAFTS).runtimeMode==='procedural');
console.log(`Ship manifest: ${AIRCRAFTS.length} aircraft, ${missing.length} procedural-only (assets not provided).`);
console.log(`Graphics 2.1 static checks: ${tests.length-failed}/${tests.length}`);
if(failed) process.exitCode=1;
