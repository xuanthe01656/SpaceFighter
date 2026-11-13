import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DUNGEON_CONFIG } from '../src/game/catalog/worlds.js';
import {
  CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1,
  auditCampaignGameplayFoundationLockRC1,
} from '../src/game/combat/CampaignGameplayFoundationLockRC1.js';
import {
  DUNGEON_PARITY_FOUNDATION_VERSION,
  DUNGEON_RUNTIME_PROFILES_V38,
  auditDungeonEncounterCatalogV38,
  isDungeonParityFoundationEnabledV38,
  resolveDungeonRuntimeProfileV38,
} from '../src/game/dungeon/DungeonEncounterCatalogV38.js';
import {
  DUNGEON_CONTENT_CATALOG_VERSION,
  DUNGEON_CONTENT_CATALOG_V393,
  DUNGEON_OBJECTIVE_PROFILES_V393,
  auditDungeonContentCatalogV393,
  resolveDungeonVisualAssetRefsV393,
} from '../src/game/dungeon/DungeonContentCatalogV393.js';
import {
  DUNGEON_ENCOUNTER_DIRECTOR_VERSION,
  auditDungeonEncounterDirectorV38,
  buildDungeonRoomSpawnPlanV38,
  createDungeonEncounterDirectorV38,
  getDungeonEncounterSnapshotV38,
  stepDungeonEncounterDirectorV38,
} from '../src/game/dungeon/DungeonEncounterDirectorV38.js';
import {
  DUNGEON_COMBAT_ADAPTER_VERSION,
  auditDungeonCombatAdapterV38,
  createDungeonCombatSlotDescriptorV38,
  resolveDungeonEnemySpecV38,
} from '../src/game/dungeon/DungeonCombatAdapterV38.js';
import {
  DUNGEON_BOSS_ADAPTER_VERSION,
  auditDungeonBossAdapterV38,
  projectilesFromDungeonBossAttackPlanV38,
  resolveDungeonBossBindingV38,
} from '../src/game/dungeon/DungeonBossAdapterV38.js';
import {
  DUNGEON_PRODUCTION_PRESENTATION_VERSION,
  auditDungeonPresentationV39,
  resolveDungeonBossPatternPresentationV39,
  resolveDungeonPresentationV39,
} from '../src/game/dungeon/DungeonPresentationV39.js';
import {
  CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32,
  resolveCampaignProjectileVisualV32,
} from '../src/game/rendering/CampaignProjectileVisualV32.js';
import {
  createCampaignEnemyCombatSlotRegistryV37,
  getCampaignEnemyCombatSlotV37,
  syncCampaignEnemyCombatSlotsV37,
} from '../src/game/combat/CampaignEnemyCombatSlotsV37.js';
import { ENEMY_ARCHETYPES_V2 } from '../src/game/combat/EnemyCombatCatalogV2.js';
import { resolveAssetVisual } from '../src/game/assets/AssetRegistry.js';
import {
  DUNGEON_COMBAT_INTEGRITY_VERSION,
  auditDungeonCombatIntegrityV392,
  logicalCircleHitV392,
  logicalSegmentCircleHitV392,
  requiredDungeonVisualAssetIdsV392,
  resolveDungeonHazardCombatV392,
  resolveDungeonHostileProjectileHitRadiusV392,
} from '../src/game/dungeon/DungeonCombatIntegrityV392.js';
import {
  DUNGEON_ROOM_FLOW_VERSION,
  advanceNaturalHazardMotionV394,
  auditDungeonRoomFlowV394,
  createNaturalHazardMotionV394,
  createProgressiveObjectiveSequenceV394,
  getProgressiveObjectiveSnapshotV394,
  resolveDungeonHazardCueV394,
  stepProgressiveObjectiveSequenceV394,
} from '../src/game/dungeon/DungeonRoomFlowV394.js';
import {
  DUNGEON_VISUAL_BINDING_VERSION,
  auditDungeonVisualBindingsV394,
  resolveDungeonBossVisualBindingV394,
  resolveDungeonEnemyVisualBindingV394,
} from '../src/game/dungeon/DungeonVisualBindingV394.js';
import {
  DUNGEON_WORLD_TRAVERSAL_VERSION,
  advanceDungeonObjectiveWorldMotionV395,
  auditDungeonWorldTraversalV395,
  createDungeonObjectiveWorldMotionV395,
} from '../src/game/dungeon/DungeonWorldTraversalV395.js';
import {
  DUNGEON_HUD_CATALOG_VERSION,
  DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396,
  DUNGEON_HUD_PROFILES_V396,
  auditDungeonHudCatalogV396,
  buildDungeonRoomMarkersV396,
  resolveDungeonHudOcclusionLineV396,
  resolveDungeonHudProfileV396,
  resolveDungeonHudRoomV396,
  resolveDungeonObjectiveProgressV396,
} from '../src/game/dungeon/DungeonHudCatalogV396.js';

test('Campaign Gameplay Foundation Lock RC1 is exact and drift-free', () => {
  assert.equal(CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.version,
    'campaign-gameplay-foundation-lock-rc1.0.0');
  assert.equal(CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.status, 'locked');
  assert.equal(CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.architecture.finalBossState, 'xstate_v5');
  assert.equal(CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.architecture.rendererAuthority,
    'presentation_only');
  assert.deepEqual(auditCampaignGameplayFoundationLockRC1(), []);
});


test('Dungeon V3.9.5 content catalog is modular, five-room and future-safe', () => {
  assert.equal(DUNGEON_CONTENT_CATALOG_VERSION, 'dungeon-content-catalog-v3.9.5');
  assert.deepEqual(auditDungeonContentCatalogV393(), []);
  assert.deepEqual(Object.keys(DUNGEON_CONTENT_CATALOG_V393), [
    'dung_taurus', 'dung_nereus', 'dung_abaddon',
  ]);
  assert.deepEqual(
    DUNGEON_CONFIG.map(item => item.id).sort(),
    Object.keys(DUNGEON_CONTENT_CATALOG_V393).sort(),
    'product schedule/economy IDs and authored Dungeon content IDs must stay in parity',
  );
  for (const profile of Object.values(DUNGEON_CONTENT_CATALOG_V393)) {
    assert.equal(profile.rooms.length, 5);
    assert.equal(new Set(profile.rooms.map(room => room.id)).size, 5);
    assert.ok(profile.rooms.length >= profile.runStructure.minimumRooms);
    assert.ok(profile.rooms.length <= profile.runStructure.maximumRooms);
    assert.ok(profile.rooms.some(room => room.id === profile.runStructure.entryRoomId));
    assert.equal(profile.rooms.find(room => room.id === profile.runStructure.bossRoomId)?.templateId, 'boss');
    assert.equal(Object.keys(profile.visualSet.enemyByRole).length, 6);
    assert.equal(resolveDungeonVisualAssetRefsV393(profile.id).length, 4);
  }
  assert.ok(DUNGEON_CONTENT_CATALOG_V393.dung_nereus.difficultyRank
    > DUNGEON_CONTENT_CATALOG_V393.dung_taurus.difficultyRank);
  assert.ok(DUNGEON_CONTENT_CATALOG_V393.dung_abaddon.difficultyRank
    > DUNGEON_CONTENT_CATALOG_V393.dung_nereus.difficultyRank);

  const cluster = DUNGEON_OBJECTIVE_PROFILES_V393.taurus_salvage_cluster;
  assert.equal(cluster.nodes.length, 3);
  assert.equal(new Set(cluster.nodes.map(node => node.visualStyle)).size, 3,
    'Taurus objective must not show three identical boxes');
  assert.equal(new Set(cluster.nodes.map(node => node.depthNorm)).size, 3,
    'Taurus objective nodes must be staggered in depth, not a flat row');
  assert.equal(cluster.nodes.filter(node => node.objectiveRole === 'primary').length, 1);
  assert.equal(cluster.revealPolicy.mode, 'sequential_world_drift');
  assert.ok(cluster.revealPolicy.cruiseSpeed > 0);
  assert.deepEqual(cluster.nodes.map(node => node.sequenceIndex), [0, 1, 2]);
});

test('Dungeon V3.8 catalog exposes one enabled Taurus vertical slice and two briefs', () => {
  assert.equal(DUNGEON_PARITY_FOUNDATION_VERSION, 'dungeon-parity-foundation-v3.8.0');
  assert.deepEqual(auditDungeonEncounterCatalogV38(), []);
  assert.equal(isDungeonParityFoundationEnabledV38({ dungeonId: 'dung_taurus' }), true);
  assert.equal(isDungeonParityFoundationEnabledV38({ dungeonId: 'dung_nereus' }), false);
  assert.equal(isDungeonParityFoundationEnabledV38({ dungeonId: 'dung_abaddon' }), false);
  assert.equal(isDungeonParityFoundationEnabledV38({ dungeonId: 'dung_unknown' }), false);
  const taurus = resolveDungeonRuntimeProfileV38('dung_taurus');
  assert.equal(taurus.rooms.length, 5);
  assert.deepEqual(taurus.rooms.map(room => room.kind),
    ['entry', 'ambush', 'breakable', 'elite', 'boss']);
  const salvage = taurus.rooms.find(room => room.id === 'taurus_salvage');
  assert.equal(salvage.breakablesRequired, true);
  assert.equal(salvage.breakables.length, 3);
  const bossRoom = taurus.rooms.at(-1);
  assert.equal(bossRoom.boss.sharedBossProfileId, 'alpha_mech_sentinel');
  assert.equal(DUNGEON_RUNTIME_PROFILES_V38.dung_nereus.status, 'catalog_ready');
  assert.equal(DUNGEON_RUNTIME_PROFILES_V38.dung_abaddon.status, 'catalog_ready');
});

test('Dungeon room plans are deterministic, bounded and catalog-valid', () => {
  assert.equal(DUNGEON_ENCOUNTER_DIRECTOR_VERSION, 'dungeon-encounter-director-v3.8.0');
  assert.deepEqual(auditDungeonEncounterDirectorV38(), []);
  const first = buildDungeonRoomSpawnPlanV38({ dungeonId: 'dung_taurus', roomIndex: 3, seed: 9842 });
  const second = buildDungeonRoomSpawnPlanV38({ dungeonId: 'dung_taurus', roomIndex: 3, seed: 9842 });
  assert.deepEqual(first, second);
  assert.ok(first.entries.length > 0);
  assert.ok(first.entries.length <= 40);
  assert.ok(first.entries.every(entry => ENEMY_ARCHETYPES_V2[entry.roleId]));
  assert.ok(first.entries.every(entry => entry.spawnAtMs >= 0));
  assert.ok(first.authoredThreat <= first.room.threatBudget);
});

test('Dungeon director completes all five Taurus rooms and gates salvage on breakables', () => {
  const director = createDungeonEncounterDirectorV38({ dungeonId: 'dung_taurus', seed: 77, nowMs: 0 });
  let nowMs = 0;
  let activeBreakables = 0;
  let sawSalvageBlocked = false;
  let sawBossSpawn = false;
  let completedEvent = null;

  for (let guard = 0; guard < 1000 && !director.completed; guard += 1) {
    nowMs += 500;
    const snapshotBefore = getDungeonEncounterSnapshotV38(director);
    const currentRoom = director.roomPlan?.room || null;
    if (currentRoom?.id === 'taurus_salvage' && currentRoom.breakablesRequired) {
      if (activeBreakables === 0 && director.status === 'combat') activeBreakables = 3;
      if (director.spawnCursor >= (director.roomPlan?.entries?.length || 0)) {
        if (activeBreakables > 0) sawSalvageBlocked = true;
        if (guard % 3 === 0) activeBreakables = 0;
      }
    } else {
      activeBreakables = 0;
    }

    const step = stepDungeonEncounterDirectorV38(director, {
      nowMs,
      activeEnemyCount: 0,
      activeBreakableCount: activeBreakables,
      bossAlive: sawBossSpawn,
      bossDefeated: sawBossSpawn && snapshotBefore?.roomId === 'taurus_boss' && guard % 4 === 0,
      maxSpawnEventsPerStep: 3,
    });
    for (const event of step.events) {
      if (event.type === 'spawn_breakables') activeBreakables = event.breakables.length;
      if (event.type === 'spawn_boss') sawBossSpawn = true;
      if (event.type === 'dungeon_completed') completedEvent = event;
    }
  }

  assert.equal(sawSalvageBlocked, true);
  assert.equal(sawBossSpawn, true);
  assert.equal(director.completed, true);
  assert.equal(director.roomsCleared, 5);
  assert.equal(completedEvent?.totalRooms, 5);
});

test('Dungeon combat adapter reuses all Campaign roles and distributed slots', () => {
  assert.equal(DUNGEON_COMBAT_ADAPTER_VERSION, 'dungeon-combat-adapter-v3.8.0');
  assert.deepEqual(auditDungeonCombatAdapterV38(), []);
  const room = resolveDungeonRuntimeProfileV38('dung_taurus').rooms[3];
  const enemies = Object.keys(ENEMY_ARCHETYPES_V2).map((roleId, index) => {
    const spec = resolveDungeonEnemySpecV38({
      dungeonId: 'dung_taurus',
      room,
      entry: { id: `role:${roleId}`, roleId, laneNorm: (index - 2.5) / 3 },
    });
    return { runtimeId: spec.id, spec, seed: index + 1 };
  });
  const charger = enemies.find(enemy => enemy.spec.roleId === 'charger').spec;
  assert.equal(charger.canShoot, false);
  assert.equal(charger.weapon.projectile, null);
  for (const enemy of enemies.filter(item => item.spec.roleId !== 'charger')) {
    assert.equal(enemy.spec.canShoot, true);
    assert.ok(enemy.spec.weapon.projectile.speed > 0);
    assert.ok(enemy.spec.fireRangeMax > enemy.spec.fireRangeMin);
  }
  for (const enemy of enemies) {
    const visual = resolveAssetVisual('dungeon_enemy', enemy.spec.visualAssetId);
    assert.equal(visual?.assetId, `dungeon_enemy:${enemy.spec.visualAssetId}`);
    assert.match(visual?.atlasSrc || '', /_sheet\.webp$/);
  }

  const registry = createCampaignEnemyCombatSlotRegistryV37();
  syncCampaignEnemyCombatSlotsV37(
    registry,
    enemies.map(createDungeonCombatSlotDescriptorV38),
    { nowMs: 100 },
  );
  const rangedSlots = enemies
    .filter(enemy => enemy.spec.roleId !== 'charger')
    .map(enemy => getCampaignEnemyCombatSlotV37(registry, enemy.runtimeId));
  assert.ok(rangedSlots.every(Boolean));
  assert.equal(new Set(rangedSlots.map(slot => slot.slotId)).size, rangedSlots.length);
});

test('Dungeon Boss adapter binds Taurus to shared XState arsenal and scales projectiles', () => {
  assert.equal(DUNGEON_BOSS_ADAPTER_VERSION, 'dungeon-boss-adapter-v3.9.0');
  assert.deepEqual(auditDungeonBossAdapterV38(), []);
  const bossSpec = {
    id: 'taurus_rust_driller',
    sharedBossProfileId: 'alpha_mech_sentinel',
    damageMultiplier: .88,
    projectileSpeedMultiplier: .96,
  };
  const binding = resolveDungeonBossBindingV38(bossSpec);
  assert.equal(binding.profileId, 'alpha_mech_sentinel');
  assert.equal(binding.dungeonId, 'dung_taurus');
  assert.equal(binding.visualAssetId, 'dung_taurus_boss');
  const plan = {
    id: 'boss-plan-1',
    pattern: 'alpha_lock_burst',
    visualId: 'boss_alpha_rail',
    bossProfileId: 'alpha_mech_sentinel',
    planetId: 1,
    bossType: 'mech',
    projectileDamage: 100,
    damageType: 'energy',
    paths: [{
      origin: { x: 0, y: 0, z: -8 },
      endpoint: { x: 0, z: 10 },
      velocity: { x: .25, z: .80 },
      fireOffsetMs: 0,
      width: .4,
    }],
  };
  const [projectile] = projectilesFromDungeonBossAttackPlanV38(plan, bossSpec);
  assert.equal(projectile.rawDamage, 88);
  assert.equal(projectile.velocity.x, .24);
  assert.equal(projectile.velocity.z, .768);
  assert.equal(projectile.sourcePattern, 'alpha_lock_burst');
  assert.equal(projectile.pattern, 'taurus_drill_lance');
  assert.equal(projectile.visualId, 'dungeon_taurus_drill_lance');
});

test('Dungeon V3.9 presentation resolves production Taurus identity without changing combat authority', () => {
  assert.equal(DUNGEON_PRODUCTION_PRESENTATION_VERSION,
    'dungeon-production-presentation-v3.9.5');
  assert.deepEqual(auditDungeonPresentationV39(), []);
  const profile = resolveDungeonPresentationV39('dung_taurus');
  assert.equal(profile.boss.visualAssetId, 'dung_taurus_boss');
  const bossAsset = resolveAssetVisual('dungeon_boss', profile.boss.visualAssetId);
  assert.equal(bossAsset?.assetId, 'dungeon_boss:dung_taurus_boss');
  assert.match(bossAsset?.atlasSrc || '', /dung_taurus_boss_sheet\.webp$/);
  assert.notEqual(profile.palette.clearColor.toLowerCase(), '#4ade80');
  assert.equal(profile.hazard.warningMode, 'edge_pulse');
  assert.ok(profile.hazard.warningMs >= 180 && profile.hazard.warningMs <= 400);
  assert.equal(profile.hazard.warningDepth, 0);
  const pattern = resolveDungeonBossPatternPresentationV39({
    dungeonId: 'dung_taurus',
    patternId: 'alpha_overdrive',
    visualId: 'boss_alpha_overdrive',
  });
  assert.equal(pattern.patternId, 'taurus_foundry_overdrive');
  assert.equal(pattern.visualId, 'dungeon_taurus_overdrive');
  for (const visualId of [
    'dungeon_taurus_drill_lance',
    'dungeon_taurus_ore_cutter',
    'dungeon_taurus_shrapnel',
    'dungeon_taurus_overdrive',
  ]) {
    assert.ok(CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32[visualId]);
    assert.equal(resolveCampaignProjectileVisualV32({ visualId }).id, visualId);
  }
});


test('Dungeon V3.9.5 reveals salvage nodes sequentially and keeps objectives in world-space motion', () => {
  assert.equal(DUNGEON_ROOM_FLOW_VERSION, 'dungeon-room-flow-v3.9.5');
  assert.deepEqual(auditDungeonRoomFlowV394(), []);
  const cluster = DUNGEON_OBJECTIVE_PROFILES_V393.taurus_salvage_cluster;
  const state = createProgressiveObjectiveSequenceV394({
    definitions: cluster.nodes,
    policy: cluster.revealPolicy,
    nowMs: 1000,
  });
  let step = stepProgressiveObjectiveSequenceV394(state, { nowMs: 1649, activeIds: [] });
  assert.equal(step.events.length, 0);
  step = stepProgressiveObjectiveSequenceV394(state, { nowMs: 1650, activeIds: [] });
  assert.equal(step.events[0].definition.id, 'taurus_salvage_core');
  assert.equal(getProgressiveObjectiveSnapshotV394(state).remainingCount, 3);
  step = stepProgressiveObjectiveSequenceV394(state, { nowMs: 1800, activeIds: ['taurus_salvage_core'] });
  assert.equal(step.events.length, 0, 'the next node cannot appear while the current target is alive');
  step = stepProgressiveObjectiveSequenceV394(state, { nowMs: 1900, activeIds: [] });
  assert.equal(step.destroyedCount, 1);
  assert.equal(step.events[0].type, 'objective_node_cleared');
  step = stepProgressiveObjectiveSequenceV394(state, { nowMs: 2949, activeIds: [] });
  assert.equal(step.events.length, 0);
  step = stepProgressiveObjectiveSequenceV394(state, { nowMs: 2950, activeIds: [] });
  assert.equal(step.events[0].definition.id, 'taurus_ore_pod_left');

  const cue = resolveDungeonHazardCueV394(resolveDungeonRuntimeProfileV38('dung_taurus').rooms[1].hazard);
  assert.equal(cue.mode, 'edge_pulse');
  assert.ok(cue.durationMs <= 400);
  const motion = createNaturalHazardMotionV394({ seed: 77, index: 2, laneNorm: .3, speed: .085 });
  const first = advanceNaturalHazardMotionV394(motion, 1);
  const second = advanceNaturalHazardMotionV394(motion, 1);
  assert.ok(first.zDelta > 0 && second.travel > first.travel);
  assert.notEqual(first.x, second.x, 'rock must drift naturally instead of following a perfectly straight guide');

  assert.equal(DUNGEON_WORLD_TRAVERSAL_VERSION, 'dungeon-world-traversal-v3.9.5');
  assert.deepEqual(auditDungeonWorldTraversalV395(), []);
  const objectiveMotion = createDungeonObjectiveWorldMotionV395({
    seed: 77,
    definition: cluster.nodes[0],
    policy: cluster.revealPolicy,
    arenaHalfWidth: 7,
    worldHalfHeight: 15,
    nowMs: 0,
  });
  let previousZ = objectiveMotion.z;
  let sawCruise = false;
  let sawWrap = false;
  for (let frame = 0; frame < 2000; frame += 1) {
    const objectiveStep = advanceDungeonObjectiveWorldMotionV395(objectiveMotion, {
      nowMs: frame * 16.667,
      frameFactor: 1,
    });
    if (objectiveStep.visible) {
      assert.ok(objectiveStep.z > previousZ, 'visible objective must keep drifting with the scrolling world');
      previousZ = objectiveStep.z;
      if (objectiveStep.phase === 'cruise') sawCruise = true;
    }
    if (objectiveStep.wrapped) { sawWrap = true; break; }
  }
  assert.equal(sawCruise, true);
  assert.equal(sawWrap, true, 'a missed objective must re-enter instead of anchoring or dead-locking the room');
});

test('Dungeon V3.9.4 binds authored atlases for every current role and has a temporary fallback contract', () => {
  assert.equal(DUNGEON_VISUAL_BINDING_VERSION, 'dungeon-visual-binding-v3.9.4');
  assert.deepEqual(auditDungeonVisualBindingsV394(), []);
  const gunner = resolveDungeonEnemyVisualBindingV394({ dungeonId: 'dung_taurus', roleId: 'gunner' });
  assert.equal(gunner.mode, 'authored_atlas');
  assert.equal(gunner.assetId, 'dung_taurus_scout');
  assert.ok(gunner.profile?.atlasSrc);
  const repairedAlias = resolveDungeonEnemyVisualBindingV394({
    dungeonId: 'dung_taurus', roleId: 'support', requestedAssetId: 'missing-runtime-alias',
  });
  assert.equal(repairedAlias.mode, 'authored_atlas');
  assert.equal(repairedAlias.assetId, 'dung_taurus_elite');
  const temporary = resolveDungeonEnemyVisualBindingV394({
    dungeonId: 'dung_taurus', roleId: 'artillery', profileResolver: () => null,
  });
  assert.equal(temporary.mode, 'temporary_procedural');
  assert.equal(temporary.temporaryStyle, 'long_cannon');
  const boss = resolveDungeonBossVisualBindingV394({ dungeonId: 'dung_taurus' });
  assert.equal(boss.mode, 'authored_atlas');
  assert.equal(boss.assetId, 'dung_taurus_boss');
  const temporaryBoss = resolveDungeonBossVisualBindingV394({
    dungeonId: 'dung_taurus', profileResolver: () => null,
  });
  assert.equal(temporaryBoss.mode, 'temporary_procedural');
});


test('Dungeon V3.9.5 keeps authored atlas roots pitch/roll neutral and objectives non-anchored', () => {
  const source = fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');
  assert.match(source, /dungeonVisualRootNeutralV395:\s*true/);
  assert.match(source, /CreateSphere\(`eE_\$\{runtimeId\}`/,
    'elite collider must be a neutral root rather than the rotated torus itself');
  assert.doesNotMatch(source, /mesh = BABYLON\.MeshBuilder\.CreateTorus\(`eE_[\s\S]{0,180}mesh\.rotation\.x = Math\.PI \/ 2/);
  assert.match(source, /advanceDungeonObjectiveWorldMotionV395/);
  assert.doesNotMatch(source, /item\.anchored\s*\|\|/);
  assert.match(source, /debris\.isWorldVisible === false/);
});

test('Dungeon V3.9.2 integrity makes hazards destructible and hostile damage renderer-independent', () => {
  assert.equal(DUNGEON_COMBAT_INTEGRITY_VERSION, 'dungeon-combat-integrity-v3.9.2');
  assert.deepEqual(auditDungeonCombatIntegrityV392(), []);
  const hazardConfig = resolveDungeonRuntimeProfileV38('dung_taurus').rooms[1].hazard;
  const hazard = resolveDungeonHazardCombatV392(hazardConfig);
  assert.equal(hazard.destructible, true);
  assert.equal(hazard.hp, 180);
  assert.equal(hazard.score, 45);
  assert.equal(logicalCircleHitV392({ x: 0, z: 0 }, { x: 1.19, z: 0 }, 1.2), true);
  assert.equal(logicalCircleHitV392({ x: 0, z: 0 }, { x: 1.21, z: 0 }, 1.2), false);
  assert.equal(logicalCircleHitV392(null, { x: 0, z: 0 }, 1.2), false);
  assert.equal(logicalSegmentCircleHitV392(
    { x: -2, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 0 }, .4,
  ), true);
  assert.equal(logicalSegmentCircleHitV392(
    { x: -2, z: 2 }, { x: 2, z: 2 }, { x: 0, z: 0 }, .4,
  ), false);
  const normalRadius = resolveDungeonHostileProjectileHitRadiusV392({
    priority: 'normal', visual: { width: .30 },
  });
  const bossRadius = resolveDungeonHostileProjectileHitRadiusV392({
    priority: 'boss', visual: { width: .50 },
  });
  assert.ok(normalRadius >= 1);
  assert.ok(bossRadius >= 1.2);
  assert.ok(bossRadius > normalRadius);
  const required = requiredDungeonVisualAssetIdsV392({
    dungeonId: 'dung_taurus', bossVisualAssetId: 'dung_taurus_boss',
  });
  assert.deepEqual(required.map(entry => entry.id), [
    'dung_taurus_scout', 'dung_taurus_heavy', 'dung_taurus_elite', 'dung_taurus_boss',
  ]);
  assert.ok(required.every(entry => resolveAssetVisual(entry.kind, entry.id)?.atlasSrc));
});

test('DungeonScene integrates parity director, required objectives and shared Boss XState', () => {
  const source = fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');
  assert.match(source, /assertCampaignGameplayFoundationLockRC1\(\)/);
  assert.match(source, /stepDungeonEncounterDirectorV38\(/);
  assert.match(source, /getProgressiveObjectiveSnapshotV394\(dungeonObjectiveSequenceV394\)\.remainingCount/);
  assert.match(source, /createDungeonBossControllerV38\(/);
  assert.match(source, /stepDungeonBossControllerV38\(/);
  assert.match(source, /projectilesFromDungeonBossAttackPlanV38\(/);
  assert.match(source, /createDungeonEnemyChoreographyStateV38\(/);
  assert.match(source, /syncCampaignEnemyCombatSlotsV37\(/);
  assert.match(source, /resolveDungeonEnemyMuzzleOriginV38/);
  assert.match(source, /remainingSpawns/);
  assert.match(source, /clearDungeonHostileProjectilesV38/);
  assert.match(source, /createDungeonHazardTelegraphV39/);
  assert.match(source, /resolveDungeonHazardCueV394/);
  assert.match(source, /advanceNaturalHazardMotionV394/);
  assert.match(source, /stepProgressiveObjectiveSequenceV394/);
  assert.match(source, /spawnDungeonBreakableNodeV394/);
  assert.match(source, /resolveDungeonEnemyVisualBindingV394/);
  assert.match(source, /createDungeonBreakableVisualV39/);
  assert.match(source, /createDungeonBossFallbackV39/);
  assert.match(source, /bossVisualAssetId/);
  assert.match(source, /preloadBattleEntityVisualProfiles/);
  assert.match(source, /dungeonVisualSpawnGateReadyV392/);
  assert.match(source, /resolveDungeonHazardCombatV392/);
  assert.match(source, /hazard\.visual\?\.setRatio/);
  assert.match(source, /logicalSegmentCircleHitV392\(/);
  assert.doesNotMatch(source, /eb\.intersectsMesh\(shipVisual\.collider/);
  assert.match(source, /dungeonObjectivePanel/);
  assert.match(source, /HOÀN THÀNH\\nPHÓ BẢN!/);
  assert.doesNotMatch(source, /scene\.clearColor\s*=\s*hexToColor4\(dungeonConfig\.themeColor/);
  assert.doesNotMatch(source, /CAMPAIGN\\nCLEARED/);
  assert.match(source, /VITE_SF_DUNGEON_PARITY_V38/);
  assert.match(source, /startLegacyDungeonWhenVisualsReadyV392/);
  assert.match(source, /scheduleBattleTimer\(startLegacyDungeonWhenVisualsReadyV392, 80\)/);
});


test('Dungeon HUD V3.9.6 is catalog-driven, presentation-only and future-safe', () => {
  assert.equal(DUNGEON_HUD_CATALOG_VERSION, 'dungeon-hud-catalog-v3.9.6');
  assert.deepEqual(auditDungeonHudCatalogV396(), []);
  assert.deepEqual(
    Object.keys(DUNGEON_HUD_PROFILES_V396).sort(),
    Object.keys(DUNGEON_CONTENT_CATALOG_V393).sort(),
  );
  const taurus = resolveDungeonHudProfileV396('dung_taurus');
  assert.equal(taurus.shortCode, 'TAURUS');
  assert.equal(taurus.layout.publishIntervalMs, 100);
  assert.equal(taurus.layout.maxRoomMarkers, DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396);
  assert.equal(taurus.layout.reservedTopPx, 208);
  const phoneLine = resolveDungeonHudOcclusionLineV396({
    dungeonId: 'dung_taurus', worldHalfHeight: 15, viewportHeight: 852,
  });
  const tabletLine = resolveDungeonHudOcclusionLineV396({
    dungeonId: 'dung_taurus', worldHalfHeight: 15, viewportHeight: 1280,
  });
  assert.ok(phoneLine > tabletLine, 'phone HUD occupies more world depth than tablet HUD');
  assert.ok(taurus.colors.accent.startsWith('#'));
  assert.equal(Object.prototype.hasOwnProperty.call(taurus, 'damage'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(taurus, 'reward'), false);
});

test('Dungeon HUD room rail scales beyond the current five-room vertical slice', () => {
  const rooms = Array.from({ length: 12 }, (_, index) => ({
    id: `future_room_${index + 1}`,
    kind: index === 11 ? 'boss' : (index % 4 === 2 ? 'breakable' : 'entry'),
    title: { vi: `Phòng ${index + 1}`, en: `Room ${index + 1}` },
    objective: { vi: 'Mục tiêu', en: 'Objective' },
  }));
  const markers = buildDungeonRoomMarkersV396({
    dungeonId: 'dung_taurus',
    rooms,
    currentRoomIndex: 7,
    maxMarkers: 8,
    lang: 'vi',
  });
  assert.ok(markers.length <= 8);
  assert.ok(markers.some(marker => marker.index === 0));
  assert.ok(markers.some(marker => marker.index === 7 && marker.status === 'active'));
  assert.ok(markers.some(marker => marker.index === 11 && marker.kind === 'boss'));
  assert.ok(markers.some(marker => marker.gapBefore));
});

test('Dungeon HUD objective adapter keeps hostile, node and Boss progress semantically distinct', () => {
  const hostile = resolveDungeonObjectiveProgressV396({
    roomKind: 'entry', enemiesDefeated: 3, enemiesTotal: 8, lang: 'vi',
  });
  assert.equal(hostile.mode, 'hostiles');
  assert.equal(hostile.value, '3/8');
  assert.equal(hostile.ratio, 3 / 8);

  const nodes = resolveDungeonObjectiveProgressV396({
    roomKind: 'breakable', nodesDestroyed: 2, nodesTotal: 3,
    enemiesDefeated: 4, enemiesTotal: 6, lang: 'vi',
  });
  assert.equal(nodes.mode, 'nodes');
  assert.equal(nodes.value, '2/3');
  assert.match(nodes.secondary, /4\/6/);

  const boss = resolveDungeonObjectiveProgressV396({
    roomKind: 'boss', bossHp: 2500, bossMaxHp: 10000, lang: 'vi',
  });
  assert.equal(boss.mode, 'boss');
  assert.equal(boss.value, '25%');
  assert.equal(boss.ratio, .25);

  const complete = resolveDungeonObjectiveProgressV396({ roomComplete: true, lang: 'en' });
  assert.equal(complete.mode, 'complete');
  assert.equal(complete.ratio, 1);
});

test('Dungeon HUD V3.9.6 owns fixed presentation while Babylon retains world-space UI', () => {
  const engineSource = fs.readFileSync(new URL('../src/components/Dungeon/DungeonEngine.jsx', import.meta.url), 'utf8');
  const sceneSource = fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');
  const hudSource = fs.readFileSync(new URL('../src/ui-system/DungeonHudV396.jsx', import.meta.url), 'utf8');
  const cssSource = fs.readFileSync(new URL('../src/ui-system/DungeonHudV396.module.css', import.meta.url), 'utf8');

  assert.match(engineSource, /<DungeonHudV396/);
  assert.match(engineSource, /onHudUpdate:/);
  assert.match(engineSource, /onAnnouncement:/);
  assert.doesNotMatch(engineSource, /DUNGEON QA · NO REWARDS\s*<br/);
  assert.match(sceneSource, /externalHudV396/);
  assert.match(sceneSource, /publishDungeonHudV396/);
  assert.match(sceneSource, /publishIntervalMs/);
  assert.match(sceneSource, /topBar\.isVisible = !externalHudV396/);
  assert.match(sceneSource, /objectivePanel\.isVisible = !externalHudV396/);
  assert.match(hudSource, /RoomRail/);
  assert.match(hudSource, /objectiveMode === 'boss'/);
  assert.match(cssSource, /--sf-native-battle-hud-top/);
  assert.match(cssSource, /env\(safe-area-inset-left/);
  assert.match(cssSource, /pointer-events:\s*none/);
  assert.match(cssSource, /\.retreatAction[\s\S]*pointer-events:\s*auto/);
});

test('Dungeon HUD room metadata is localized and derived from authored content', () => {
  const room = resolveDungeonHudRoomV396({
    dungeonId: 'dung_taurus',
    room: DUNGEON_CONTENT_CATALOG_V393.dung_taurus.rooms[2],
    roomIndex: 2,
    lang: 'vi',
  });
  assert.equal(room.id, 'taurus_salvage');
  assert.equal(room.kind, 'breakable');
  assert.equal(room.kindLabel, 'MỤC TIÊU');
  assert.match(room.title, /THU HỒI/);
});
