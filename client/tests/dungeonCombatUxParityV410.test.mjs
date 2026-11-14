import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DUNGEON_COMBAT_UX_VERSION_V410,
  DUNGEON_ROLE_ENGAGEMENT_VERSION_V410,
  DUNGEON_ROLE_ENGAGEMENT_PROFILES_V410,
  applyDungeonRoleEngagementV410,
  auditDungeonRoleEngagementV410,
  projectDungeonCombatSlotV410,
  resolveDungeonRoleEngagementV410,
} from '../src/game/dungeon/DungeonRoleEngagementV410.js';
import {
  DUNGEON_SHIP_SKILL_ADAPTER_VERSION_V410,
  auditDungeonShipSkillAdapterV410,
  createDungeonShipSkillAdapterV410,
} from '../src/game/dungeon/DungeonShipSkillAdapterV410.js';
import { DUNGEON_HUD_CATALOG_VERSION } from '../src/game/dungeon/DungeonHudCatalogV396.js';
import { createDungeonQaReadinessV400 } from '../src/game/dungeon/DungeonQaReadinessV400.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const engagement = roleId => resolveDungeonRoleEngagementV410({
  roleId,
  playerZ: 12.5,
  hudOcclusionLineZ: -11.5,
  worldHalfHeight: 15,
  authoredPreferredRange: roleId === 'artillery' ? 11.1 : roleId === 'support' ? 8.8 : 7.5,
  authoredFireRangeMin: roleId === 'artillery' ? 9.2 : roleId === 'support' ? 7.3 : 4.6,
  authoredFireRangeMax: roleId === 'artillery' ? 13.4 : roleId === 'support' ? 10.8 : 9.6,
});

test('V4.1 role engagement is audit-clean, role-specific and HUD-safe', () => {
  assert.equal(DUNGEON_COMBAT_UX_VERSION_V410, 'dungeon-combat-ux-parity-v4.1.0');
  assert.equal(DUNGEON_ROLE_ENGAGEMENT_VERSION_V410, 'dungeon-role-engagement-v4.1.0');
  assert.deepEqual(auditDungeonRoleEngagementV410(), []);
  assert.deepEqual(Object.keys(DUNGEON_ROLE_ENGAGEMENT_PROFILES_V410), [
    'raider', 'gunner', 'shieldbearer', 'support', 'artillery', 'charger',
  ]);
  const rows = Object.fromEntries(['raider','gunner','shieldbearer','support','artillery']
    .map(roleId => [roleId, engagement(roleId)]));
  for (const row of Object.values(rows)) {
    assert.equal(row.canShoot, true);
    assert.ok(row.fireRangeMin < row.preferredRange);
    assert.ok(row.preferredRange < row.fireRangeMax);
    assert.ok(row.fireRangeMax <= row.combatDepth);
    assert.ok(row.maxCombatZ < 6);
  }
  assert.ok(rows.artillery.preferredRange > rows.support.preferredRange);
  assert.ok(rows.support.preferredRange > rows.gunner.preferredRange);
  const charger = engagement('charger');
  assert.equal(charger.canShoot, false);
  assert.equal(charger.contactOnly, true);
});

test('V4.1 projects stable Campaign slots without replacing movement authority', () => {
  const gunner = engagement('gunner');
  const slot = Object.freeze({ slotId:'gunner:0', depthOffset:1.25, minSpacing:2.1 });
  const projected = projectDungeonCombatSlotV410({ slot, engagement: gunner });
  assert.equal(projected.slotId, slot.slotId);
  assert.equal(projected.minSpacing, slot.minSpacing);
  assert.equal(projected.preferredRange, gunner.preferredRange);
  const choreography = Object.freeze({ phaseId:'firing_slot', deltaX:0.1, deltaZ:0.2, mayFire:false });
  const result = applyDungeonRoleEngagementV410({ choreography, engagement: gunner });
  assert.equal(result.phaseId, choreography.phaseId);
  assert.equal(result.deltaX, choreography.deltaX);
  assert.equal(result.deltaZ, choreography.deltaZ);
  assert.equal(result.fireRangeMin, gunner.fireRangeMin);
});

test('V4.1.1 skill adapter reuses Combat V2 and projects legacy passive armor only', () => {
  assert.equal(DUNGEON_SHIP_SKILL_ADAPTER_VERSION_V410, 'dungeon-ship-skill-adapter-v4.1.1');
  assert.deepEqual(auditDungeonShipSkillAdapterV410(), []);
  const passive = { armorPassive:'shield', passiveShieldHp:150, passiveShieldMax:200, hp:900, maxHp:1000 };
  const assault = createDungeonShipSkillAdapterV410({
    aircraftId:'ship_raptor', armorId:'armor_shield', armorName:'Energy Shield',
    getPassiveState:() => passive, maxHp:1000, seed:410,
  });
  assert.equal(assault.snapshot().activationGate.canActivate, false);
  assert.equal(assault.snapshot().passiveArmor.badge, '75%');
  assert.equal(assault.snapshot().passiveArmor.authority, 'legacy-dungeon-passives');
  assault.setBattlePhase({ phase:'PLAYING' });
  assert.equal(assault.activate().ok, true);
  assert.ok(assault.modifiers().damageMultiplier > 1);
  assert.equal(assault.activate().reason, 'COOLDOWN');
  const pulseBefore = assault.snapshot().passiveArmor.pulse;
  const pulseAfter = assault.notifyPassiveProc('shield_absorb').passiveArmor.pulse;
  assert.ok(pulseAfter > pulseBefore);
});

test('V4.1.1 uses a shared game HUD shell and Campaign-style skill/passive cluster', () => {
  const engine = read('client/src/components/Dungeon/DungeonEngine.jsx');
  const scene = read('client/src/components/Dungeon/DungeonScene.js');
  const dungeonHud = read('client/src/ui-system/DungeonHudV396.jsx');
  const tacticalHud = read('client/src/ui-system/TacticalCombatHudV411.jsx');
  const tacticalHudCss = read('client/src/ui-system/TacticalCombatHudV411.module.css');
  const dungeonSkill = read('client/src/ui-system/DungeonShipSkillButtonV410.jsx');
  const cluster = read('client/src/ui-system/TacticalAbilityClusterV411.jsx');
  const clusterCss = read('client/src/ui-system/TacticalAbilityClusterV411.module.css');
  assert.match(engine, /<DungeonShipSkillButtonV410/);
  assert.match(engine, /<DungeonHudV396/);
  assert.match(scene, /armorId: armorBase\?\.id/);
  assert.match(scene, /getPassiveState:/);
  assert.match(scene, /notifyPassiveProc\('shield_absorb'\)/);
  assert.match(dungeonHud, /TacticalCombatHudV411/);
  assert.doesNotMatch(dungeonHud, /RoomRail|objectiveChip|HỆ THỐNG GIÁP/);
  assert.match(tacticalHud, /TACTICAL_COMBAT_HUD_VERSION_V411/);
  assert.match(tacticalHud, /TacticalFrameArt/);
  assert.match(tacticalHud, /modeBadge/);
  assert.match(tacticalHud, /bossStrip/);
  assert.match(tacticalHudCss, /height:\s*82px/);
  assert.doesNotMatch(tacticalHudCss, /roomRail|objectiveCard/);
  assert.match(dungeonSkill, /TacticalAbilityClusterV411/);
  assert.match(cluster, /passive/);
  assert.match(cluster, /onPointerDown=\{activatePointer\}/);
  assert.match(clusterCss, /top:\s*58%/);
  assert.match(clusterCss, /clip-path:\s*polygon/);
  assert.doesNotMatch(clusterCss, /caption/);
});

test('V4.1.1 QA evidence identifies the new HUD without certifying production', () => {
  assert.equal(DUNGEON_HUD_CATALOG_VERSION, 'dungeon-hud-catalog-v4.1.1');
  const qa = createDungeonQaReadinessV400({
    enabled:true, dungeonId:'dung_taurus', presetId:'assault_mk3', startedAtMs:0,
  });
  qa.beginRoom({ roomId:'taurus_entry', roomIndex:0, nowMs:1000, hp:1000 });
  qa.recordShipSkill({ accepted:true });
  qa.finish({ nowMs:2000, hp:1000, result:'victory' });
  const report = qa.snapshot(2000);
  assert.equal(report.dungeonHudVersion, DUNGEON_HUD_CATALOG_VERSION);
  assert.equal(report.dungeonShipSkillAdapterVersion, DUNGEON_SHIP_SKILL_ADAPTER_VERSION_V410);
  assert.equal(report.productionApproved, false);
  assert.equal(report.releaseStatus, 'APK_QA_REVIEW_REQUIRED');
});
