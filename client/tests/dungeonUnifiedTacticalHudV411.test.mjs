import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DUNGEON_HUD_CATALOG_VERSION,
  auditDungeonHudCatalogV396,
  resolveDungeonHudOcclusionLineV396,
} from '../src/game/dungeon/DungeonHudCatalogV396.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('V4.1.1 HUD catalog is compact, audit-clean and returns combat space', () => {
  assert.equal(DUNGEON_HUD_CATALOG_VERSION, 'dungeon-hud-catalog-v4.1.1');
  assert.deepEqual(auditDungeonHudCatalogV396(), []);
  const phone = resolveDungeonHudOcclusionLineV396({ worldHalfHeight:15, viewportHeight:852 });
  const tablet = resolveDungeonHudOcclusionLineV396({ worldHalfHeight:15, viewportHeight:1280 });
  assert.ok(phone < -11.2 && phone > -11.8);
  assert.ok(tablet <= -12.0 && tablet > -12.5);
});

test('V4.1.1 visual contract has notch gap, mechanical pods and no permanent progress rail', () => {
  const jsx = read('client/src/ui-system/TacticalCombatHudV411.jsx');
  const css = read('client/src/ui-system/TacticalCombatHudV411.module.css');
  assert.match(jsx, /Independent shoulders preserve a real notch/);
  assert.match(jsx, /leftPod/);
  assert.match(jsx, /rightPod/);
  assert.match(jsx, /modeBadge/);
  assert.match(jsx, /bossStrip/);
  assert.doesNotMatch(jsx, /RoomRail|roomMarkers|HỆ THỐNG GIÁP/);
  assert.match(css, /clip-path:\s*polygon/);
  assert.match(css, /height:\s*82px/);
  assert.match(css, /bossMode\s*\{\s*height:\s*104px/);
});

test('V4.1.1 ability cluster keeps one manual skill and one passive armor indicator', () => {
  const jsx = read('client/src/ui-system/TacticalAbilityClusterV411.jsx');
  const css = read('client/src/ui-system/TacticalAbilityClusterV411.module.css');
  assert.match(jsx, /TACTICAL_ABILITY_CLUSTER_VERSION_V411/);
  assert.equal((jsx.match(/<button/g) || []).length, 1);
  assert.match(jsx, /className=\{styles\.passive/);
  assert.match(jsx, /onPointerDown=\{activatePointer\}/);
  assert.match(css, /top:\s*58%/);
  assert.doesNotMatch(css, /bottom:\s*max\(/);
  assert.doesNotMatch(css, /caption/);
});
