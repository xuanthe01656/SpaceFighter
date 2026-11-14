import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createDungeonEnemyEntryShieldV422,
  advanceDungeonEnemyEntryShieldV422,
  isDungeonEnemyEntryActiveV422,
  isDungeonEnemyEntryRevealingV422,
  DUNGEON_ENEMY_ENTRY_SHIELD_VERSION_V422,
} from '../src/game/dungeon/DungeonEnemyEntryShieldV422.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const scene = fs.readFileSync(path.resolve(root, '../src/components/Dungeon/DungeonScene.js'), 'utf8');

test('V4.2.2 contract is versioned and initially protected', () => {
  const state=createDungeonEnemyEntryShieldV422({roleId:'raider'});
  assert.equal(DUNGEON_ENEMY_ENTRY_SHIELD_VERSION_V422,'dungeon-entry-shield-v4.2.2');
  assert.equal(state.phase,'approach');
  assert.equal(isDungeonEnemyEntryActiveV422(state),false);
});
test('offscreen enemies cannot become attackable simply because time passed', () => {
  const state=createDungeonEnemyEntryShieldV422();
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:100000,enemyZ:-13,hudOcclusionLineZ:-12});
  assert.equal(state.phase,'approach');
});
test('420ms visible reveal delay for ranged roles', () => {
  const state=createDungeonEnemyEntryShieldV422({roleId:'gunner'});
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:1000,enemyZ:-11.2,hudOcclusionLineZ:-12});
  assert.equal(isDungeonEnemyEntryRevealingV422(state),true);
  assert.equal(state.engageAtMs,1420);
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:1419,enemyZ:-10,hudOcclusionLineZ:-12});
  assert.equal(isDungeonEnemyEntryActiveV422(state),false);
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:1420,enemyZ:-10,hudOcclusionLineZ:-12});
  assert.equal(isDungeonEnemyEntryActiveV422(state),true);
});
test('charger and elite have longer 650ms reveal', () => {
  for (const args of [{roleId:'charger'},{roleId:'raider',elite:true}]) {
    const state=createDungeonEnemyEntryShieldV422(args);
    advanceDungeonEnemyEntryShieldV422(state,{nowMs:100,enemyZ:-10,hudOcclusionLineZ:-12});
    assert.equal(state.engageAtMs,750);
  }
});
test('state is stable after active; no re-protection during movement', () => {
  const state=createDungeonEnemyEntryShieldV422();
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:50,enemyZ:-10,hudOcclusionLineZ:-12});
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:1000,enemyZ:-10,hudOcclusionLineZ:-12});
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:2000,enemyZ:-30,hudOcclusionLineZ:-12});
  assert.equal(state.phase,'active');
});
test('HUD occlusion line and margin determine shield crossing', () => {
  const state=createDungeonEnemyEntryShieldV422();
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:1,enemyZ:-11.6,hudOcclusionLineZ:-12,visibleMargin:.65});
  assert.equal(state.phase,'approach');
  advanceDungeonEnemyEntryShieldV422(state,{nowMs:2,enemyZ:-11.35,hudOcclusionLineZ:-12,visibleMargin:.65});
  assert.equal(state.phase,'reveal');
});
test('Dungeon protects direct damage, splash, targeting and collision', () => {
  const protectedGate='isDungeonEnemyEntryActiveV422';
  assert.ok(scene.includes('const entryActiveV422 = isDungeonEnemyEntryActiveV422(e._entryShieldV422);'));
  assert.ok(scene.includes('if (entryActiveV422 && e.mesh.intersectsMesh(shipVisual.collider, false))'));
  assert.ok(scene.includes('!isDungeonEnemyEntryActiveV422(enemy._entryShieldV422)) return false;'));
  assert.ok(scene.includes('isDungeonEnemyEntryActiveV422(other._entryShieldV422)'));
  assert.ok(scene.includes('const firedV399 = isDungeonEnemyEntryActiveV422(enemy._entryShieldV422)'));
  assert.ok(scene.includes('isDungeonEnemyEntryActiveV422(e._entryShieldV422)) continue;'));
  assert.ok((scene.match(/isDungeonEnemyEntryActiveV422\(/g)||[]).length>=8);
});
test('V4.2.2 retains damage authority, telemetry and role engagement imports', () => {
  for(const required of ['applyDungeonRoleEngagementV410','createDungeonQaReadinessV400','scaleDungeonQaOutgoingDamageV403', 'resolveDungeonHudOcclusionLineV396', 'DungeonShipSkillAdapterV410']) {
    assert.ok(scene.includes(required),required);
  }
  assert.equal((scene.match(/const spawnEnemy = \(/g)||[]).length,1);
  assert.equal((scene.match(/_entryHaloV422: entryHaloV422/g)||[]).length,1);
  assert.ok(scene.includes('safeDis(e._entryHaloV422)'));
});
