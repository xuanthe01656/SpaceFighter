/**
 * SpaceFighter V8B-2B0: executable GAP AUDIT, NOT a parity certificate.
 * PASS means the documented differences between the current live Babylon
 * gameplay and the experimental server kernel remain observable and P0 holds.
 * When gameplay or core changes, re-audit and deliberately update this test.
 * No Firebase, network, writes, clocks, random source or game-state mutations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { worldDragDelta, keyboardVector } from '../src/game/combat/ShipInputController.js';
import { BATTLE_WORLD_HALF_HEIGHT, battleSpeedMultiplier } from '../src/game/config/BattleRules.js';
import { calculateHitDamage, calculateProjectileDamage, fireIntervalMs } from '../src/utils/combatStats.js';
import { describeMainSalvo } from '../src/game/combat/PlayerWeapons.js';
import combatCore from '../../server/lib/combatCoreV8.cjs';
import journalApi from '../../server/lib/combatInputJournalV8.cjs';

const { TICK_HZ, UNITS_PER_WORLD, openCombatCore, replayAcceptedChunk } = combatCore;
const { openInputJournal, validateChunk, PROTOCOL_VERSION } = journalApi;
const issuedAtMs = 1792627200000;
const battleId = 'f09df1a1-2b7f-4367-9c3c-71ef407b063a';
const sessionId = '01b27258-53a0-40f1-b22e-e73995c8dbcf';
const read = relative => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const campaignSrc = read('../src/components/Campaign/CampaignScene.js');
const dungeonSrc = read('../src/components/Dungeon/DungeonScene.js');
const inputSrc = read('../src/game/combat/ShipInputController.js');
const serviceSrc = read('../../server/lib/gameService.cjs');
const economySrc = read('../../server/lib/economy.cjs');

function fixture({ pilotOverrides = {}, enemies = [] } = {}) {
  const journal = openInputJournal({
    uid: 'v8b2b0_audit', sessionId, battleId,
    rulesVersion: 'combat-v1.0.0', loadoutHash: 'a'.repeat(64), issuedAtMs,
  });
  const pilot = {
    x: 0, z: 7000, hp: 1200, maxHp: 1200, armor: 20, atk: 100,
    movePerTick: 600, fireEveryTicks: 12, shotSpeed: 1560,
    hitRadius: 700, bulletRadius: 200,
    critChancePermille: 0, critBonusPermille: 250, dodgeChancePermille: 0,
    ...pilotOverrides,
  };
  const state = openCombatCore({
    journal, seed: 247927, arena: { halfWidth: 13200, halfHeight: 13200 },
    pilot, enemies,
  });
  return { journal, state };
}
function replay(pair, frames) {
  return replayAcceptedChunk({
    ...pair, receivedAtMs: issuedAtMs + 2000,
    chunk: { protocol: PROTOCOL_VERSION, battleId, startTick: 0, frames },
  });
}
const move = (x = 0, z = 0) => ({ x, z });

// These explicitly demonstrate *gaps* and should never be used to unlock rewards.
test('V8B-2B0 AUDIT: kernel is headless 30Hz with no victory/settlement authority', () => {
  assert.equal(TICK_HZ, 30);
  assert.equal(UNITS_PER_WORLD, 1000);
  assert.equal(Object.hasOwn(combatCore, 'verifyVictory'), false);
  assert.equal(Object.hasOwn(combatCore, 'settleReward'), false);
  assert.equal(Object.hasOwn(combatCore, 'battleFinish'), false);
});

test('V8B-2B0 AUDIT: keyboard reference mapping has identical sign and 0.60 world/tick', () => {
  const d = keyboardVector(new Set(['d']));
  assert.deepEqual(d, { x: 1, z: 0 });
  assert.equal(0.30 * 60 / TICK_HZ * UNITS_PER_WORLD, 600);
  assert.match(inputSrc, /keyboardUnitsPerFrame\s*=\s*0\.30/);
  const r = replay(fixture(), [move(127, 0)]);
  assert.equal(r.state.pilot.x, -600);
});

test('V8B-2B0 BLOCKER: touch drag permits large event delta, journal only allows bounded direction', () => {
  const dragged = worldDragDelta(500, 0, 500, 500, 15, 1, 1);
  assert.deepEqual(dragged, { x: -30, z: 0 });
  assert.match(inputSrc, /applyDelta\(x, z\)/);
  assert.throws(() => validateChunk({
    protocol: PROTOCOL_VERSION, battleId, startTick: 0,
    frames: [{ x: 0, z: 0, dragDx: 500 }],
  }), err => err.code === 'INPUT_FRAME_INVALID');
  const r = replay(fixture(), [move(127, 0)]);
  assert.ok(Math.abs(dragged.x) > Math.abs(r.state.pilot.x / UNITS_PER_WORLD));
});

test('V8B-2B0 BLOCKER: speed multiplier comes from equipment and pilot, not fixed 600', () => {
  assert.equal(battleSpeedMultiplier({ speed: 18 }), 3);
  assert.equal(battleSpeedMultiplier({ speed: 6 }), 1);
  const fastDrag = worldDragDelta(5, 0, 500, 500, 15, 1, 3);
  assert.ok(Math.abs(fastDrag.x + 0.9) < 1e-12);
  assert.equal(fastDrag.z, 0);
  assert.equal(fixture().state.pilot.movePerTick, 600);
  assert.match(campaignSrc, /speedMultiplier:\s*speedMod/);
  assert.match(dungeonSrc, /speedMultiplier:\s*battleSpeedMultiplier\(stats\)/);
});

test('V8B-2B0 BLOCKER: scene spawn is z=12.5, prototype fixture currently z=7', () => {
  assert.equal(BATTLE_WORLD_HALF_HEIGHT - 2.5, 12.5);
  for (const src of [campaignSrc, dungeonSrc]) {
    assert.match(src, /playerRoot\.position\.set\(0,\s*0,\s*ZOOM\s*-\s*2\.5\)/);
  }
  assert.equal(fixture().state.pilot.z / UNITS_PER_WORLD, 7);
});

test('V8B-2B0 BLOCKER: legacy scene edge inset differs from pilot-radius kernel edge', () => {
  const legacyLimitZ = BATTLE_WORLD_HALF_HEIGHT - 1.8;
  assert.equal(legacyLimitZ, 13.2);
  assert.match(inputSrc, /inset\s*=\s*1\.8/);
  const r = replay(fixture(), Array.from({ length: 20 }, () => move(0, 127)));
  assert.equal(r.state.pilot.z, 13200 - 700);
  assert.notEqual(r.state.pilot.z / UNITS_PER_WORLD, legacyLimitZ);
});

test('V8B-2B0 BLOCKER: main bullet origin and speed differ from shared weapon policy', () => {
  const weapon = describeMainSalvo({ firePattern: 'single' }, { x: 0, z: 7 }, 100)[0];
  assert.equal(weapon.z, 7 - 1.2);
  assert.equal(weapon.vz, -0.85);
  const r = replay(fixture(), [move()]);
  assert.equal(r.state.bullets.length, 1);
  assert.equal(r.state.bullets[0].z, 7000 - 750 - 1560);
  assert.notEqual(r.state.bullets[0].z / UNITS_PER_WORLD, weapon.z + 2 * weapon.vz);
});

test('V8B-2B0 BLOCKER: legacy 15% crit bonus rule and core are not mapped yet', () => {
  assert.equal(calculateProjectileDamage(100, 0.25, () => 0.1), 125);
  assert.equal(calculateProjectileDamage(100, 0.25, () => 0.2), 100);
  assert.equal(fixture().state.pilot.critChancePermille, 0);
  assert.equal(fixture().state.pilot.critBonusPermille, 250);
});

test('V8B-2B0 BLOCKER: second client damage reduction is absent from core state', () => {
  const clientDamage = calculateHitDamage(200, { armor: 20, dmgReduce: 0.25 }, () => 1);
  assert.equal(clientDamage.damage, 120);
  const enemy = {
    id: 'audit_enemy', x: 0, z: 7000, hp: 200,
    speedPerTick: 0, damage: 200, hitRadius: 500, behavior: 'static',
  };
  const r = replay(fixture({ enemies: [enemy] }), [move()]);
  assert.equal(1200 - r.state.pilot.hp, 160);
  assert.notEqual(1200 - r.state.pilot.hp, clientDamage.damage);
  assert.equal(Object.hasOwn(r.state.pilot, 'dmgReduce'), false);
});

test('V8B-2B0 BLOCKER: current weapon catalog has multi-shot that kernel cannot spawn', () => {
  const counts = ['single', 'spread3', 'spread5', 'shotgun', 'burst', 'wave']
    .map(firePattern => describeMainSalvo({ firePattern }, { x: 0, z: 7 }, 100).length);
  assert.deepEqual(counts, [1, 3, 5, 7, 3, 2]);
  assert.equal(replay(fixture(), [move()]).state.bullets.length, 1);
});

test('V8B-2B0 BLOCKER: current ms-based fireRate cannot always equal integer 30Hz tick', () => {
  assert.equal(fireIntervalMs(0.35, 1, 400, 'seconds'), 350);
  assert.equal(fixture().state.pilot.fireEveryTicks * 1000 / TICK_HZ, 400);
  assert.match(campaignSrc, /now\s*>\s*lastFire\s*\+\s*stats\.fireRate/);
  assert.match(dungeonSrc, /now\s*>\s*lastFire\s*\+\s*stats\.fireRate/);
});

test('V8B-2B0 BLOCKER: Campaign and Dungeon have wave/boss lifecycle outside core state', () => {
  assert.match(campaignSrc, /const\s+MAX_WAVES\s*=\s*stageConfig\.waves/);
  assert.match(dungeonSrc, /waveBossEnabled\s*=\s*n\s*%\s*3\s*===\s*0/);
  assert.match(dungeonSrc, /const\s+MAX_WAVES\s*=\s*dungeonConfig\.waves/);
  const state = fixture().state;
  for (const k of ['wave', 'waves', 'boss', 'bossHp', 'enemyBullets', 'victory']) {
    assert.equal(Object.hasOwn(state, k), false);
  }
});

test('V8B-2B0 SAFETY: P0 lock stays closed; no gameService/economy core integration', () => {
  assert.match(serviceSrc, /BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.match(serviceSrc, /command\s*===\s*'battle\.start'/);
  assert.match(serviceSrc, /command\s*===\s*'battle\.finish'\s*&&\s*payload\.victory\s*===\s*true/);
  assert.doesNotMatch(serviceSrc, /require\([^)]*combatCoreV8/);
  assert.doesNotMatch(economySrc, /require\([^)]*combatCoreV8/);
});
