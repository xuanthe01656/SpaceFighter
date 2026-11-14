import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAMPAIGN_TACTICAL_PRESENTATION_VERSION_V420,
  auditCampaignTacticalPresentationV420,
  projectCampaignTacticalAbilityV420,
  projectCampaignTacticalHudV420,
} from '../src/game/ui/CampaignTacticalPresentationV420.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(client, rel), 'utf8');

test('V4.2.0 projects Campaign HUD into the same tactical shell without owning gameplay state', () => {
  assert.equal(CAMPAIGN_TACTICAL_PRESENTATION_VERSION_V420, 'campaign-tactical-presentation-v4.2.0');
  assert.deepEqual(auditCampaignTacticalPresentationV420(), []);
  const hud = projectCampaignTacticalHudV420({
    state: { stage: 4, wave: 3, wavesTotal: 5, hp: 820, maxHp: 1050, score: 1250, kills: 8 },
    planetId: 2,
    lang: 'vi',
  });
  assert.equal(hud.modeCode, 'P2');
  assert.equal(hud.phaseLabel, 'ẢI 4');
  assert.equal(hud.objectiveCounter, 'ĐỢT 3/5');
  assert.equal(hud.hp, 820);
  assert.equal(hud.score, 1250);
  assert.equal(hud.boss, null);
});

test('V4.2.0 Campaign Boss projection uses a thin shared boss strip contract', () => {
  const hud = projectCampaignTacticalHudV420({
    state: { stage: 10, wave: 5, wavesTotal: 5, bossHp: 7200, bossMaxHp: 10000 },
    planetId: 3,
    lang: 'vi',
  });
  assert.equal(hud.objectiveCounter, 'TRÙM');
  assert.equal(hud.boss.active, true);
  assert.equal(hud.boss.hp, 7200);
  assert.match(hud.boss.name, /TINH CẦU 3/);
});

test('V4.2.0 maps Campaign Combat V2 skill and passive armor into the shared cluster', () => {
  const state = {
    tick: 300,
    activationGate: { canActivate: true, lockReason: null },
    ship: {
      id: 'skill_assault_overdrive',
      name: { vi: 'Công Kích', en: 'Assault' },
      ready: false,
      remainingTicks: 90,
      cooldownTicks: 300,
      activeTicks: 0,
    },
    armor: {
      id: 'armor_recharge_shield',
      name: { vi: 'Khiên', en: 'Shield' },
      barrierHp: 400,
      barrierMax: 800,
      rechargeDelayRemainingTicks: 0,
    },
  };
  const projected = projectCampaignTacticalAbilityV420({ state, lang: 'vi' });
  assert.equal(projected.active.ready, false);
  assert.equal(projected.active.remainingSeconds, '3.0');
  assert.equal(projected.active.cooldownProgress, .7);
  assert.equal(projected.passive.badge, '50%');
  assert.equal(projected.passive.active, true);
});

test('CampaignEngine switches from legacy BattleHud to shared tactical adapters', () => {
  const source = read('src/components/Campaign/CampaignEngine.jsx');
  assert.match(source, /CampaignTacticalHudV420/);
  assert.match(source, /CampaignTacticalAbilityAdapterV420/);
  assert.match(source, /hideCombatControls/);
  assert.doesNotMatch(source, /import BattleHud from/);
  assert.doesNotMatch(source, /<BattleHud/);
});

test('shared ability input activates on pointerdown for real two-finger mobile play', () => {
  const source = read('src/ui-system/TacticalAbilityClusterV411.jsx');
  const css = read('src/ui-system/TacticalAbilityClusterV411.module.css');
  assert.match(source, /onPointerDown=\{activatePointer\}/);
  assert.match(source, /event\?\.pointerType === 'mouse'/);
  assert.match(source, /event\?\.detail === 0/);
  assert.match(source, /data-multitouch-contract="pointerdown-primary"/);
  assert.match(source, /disabled=\{blocked\}/);
  assert.match(css, /touch-action:\s*none/);
});

test('legacy Campaign QA tools remain available without duplicating combat skill buttons', () => {
  const source = read('src/ui-system/GuestAbilityControls.jsx');
  const css = read('src/ui-system/GuestAbilityControls.module.css');
  assert.match(source, /hideCombatControls = false/);
  assert.match(source, /!hideCombatControls && <ShipAction/);
  assert.match(source, /!hideCombatControls && <ArmorPassive/);
  assert.match(source, /styles\.qaOnlyControls/);
  assert.match(css, /\.qaOnlyControls/);
});

test('Campaign and Dungeon both depend on the same tactical HUD and ability visual language', () => {
  const campaignHud = read('src/ui-system/CampaignTacticalHudV420.jsx');
  const campaignAbility = read('src/ui-system/CampaignTacticalAbilityAdapterV420.jsx');
  const dungeonHud = read('src/ui-system/DungeonHudV396.jsx');
  const dungeonAbility = read('src/ui-system/DungeonShipSkillButtonV410.jsx');
  assert.match(campaignHud, /TacticalCombatHudV411/);
  assert.match(dungeonHud, /TacticalCombatHudV411/);
  assert.match(campaignAbility, /TacticalAbilityClusterV411/);
  assert.match(dungeonAbility, /TacticalAbilityClusterV411/);
});

test('native gate keeps safe areas, compact top height and no permanent progress rail', () => {
  const hudCss = read('src/ui-system/TacticalCombatHudV411.module.css');
  const abilityCss = read('src/ui-system/TacticalAbilityClusterV411.module.css');
  const hudSource = read('src/ui-system/TacticalCombatHudV411.jsx');
  assert.match(hudCss, /env\(safe-area-inset-top/);
  assert.match(hudCss, /height:\s*82px/);
  assert.match(abilityCss, /env\(safe-area-inset-right/);
  assert.match(abilityCss, /@media \(min-width: 700px\)/);
  assert.doesNotMatch(hudSource, /roomRail|roomMarker|\[1\].*\[2\]/i);
});
