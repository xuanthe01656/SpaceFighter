import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  HQ_MODE_MANAGE_V443,
  HQ_MODE_PREBATTLE_V443,
  PORTAL_HANGAR_VERSION_V443,
  createManagementHqContextV443,
  createPrebattleHqContextV443,
  normalizeCampaignProgressV443,
  resolveHqContextV443,
} from '../src/game/navigation/HangarNavigationV443.js';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('V4.4.3 separates management Headquarters from pre-battle launch context', () => {
  assert.equal(PORTAL_HANGAR_VERSION_V443, 'portal-hangar-v4.4.3');
  const manage = createManagementHqContextV443();
  assert.equal(manage.mode, HQ_MODE_MANAGE_V443);
  assert.equal(manage.returnScreen, 'campaign_portal');
  assert.equal(manage.battleMode, null);

  const campaign = createPrebattleHqContextV443({ battleMode: 'campaign' });
  assert.equal(campaign.mode, HQ_MODE_PREBATTLE_V443);
  assert.equal(campaign.returnScreen, 'stage_select');
  const dungeon = createPrebattleHqContextV443({ battleMode: 'dungeon' });
  assert.equal(dungeon.returnScreen, 'dungeon_select');

  const gsRef = { current: { hqContext: manage } };
  assert.equal(resolveHqContextV443({ gsRef, gameMode: 'campaign' }).mode, HQ_MODE_MANAGE_V443);
});

test('V4.4.3 normalizes legacy campaign profiles so Stage Select never receives an empty planet', () => {
  const legacy = { currentStage: 1, highestStage: 1, combatPower: 1200, exp: 0 };
  const normalized = normalizeCampaignProgressV443(legacy);
  assert.strictEqual(normalized, legacy);
  assert.equal(normalized.currentPlanet, 1);
  assert.equal(normalized.selectedStage, 1);
  assert.equal(normalized.currentStage, 1);

  const defaults = read('src/game/catalog/profileDefaults.js');
  assert.match(defaults, /currentPlanet\s*:\s*1/);
  assert.match(defaults, /selectedStage\s*:\s*1/);
});

test('Campaign Portal uses a four-item management dock without a full-width Headquarters CTA', () => {
  const portal = read('src/components/CampaignPortal/index.jsx');
  const css = read('src/components/CampaignPortal/CampaignPortal.module.css');
  assert.match(portal, /openManagementHqV443/);
  assert.match(portal, /data-sf-hq-entry-v443="portal-hangar-v4\.4\.3"/);
  assert.match(portal, /className=\{`\$\{styles\.navBtn\} \$\{styles\.hqLaunchBtn\} \$\{styles\.managementNavBtn\}`\}/);
  assert.match(portal, /handleNav\('dungeon_select'\)/);
  assert.match(portal, /handleNav\('galaxy_map'\)/);
  assert.match(css, /V4\.4\.3 PORTAL MANAGEMENT DOCK/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,/);
  assert.match(css, /grid-template-areas:\s*"dungeon campaign"/);
});

test('HQ uses V4.4.3 presentation first and retains V4.4.2 as a rollback fallback', () => {
  const hq = read('src/components/HQ/index.jsx');
  assert.match(hq, /import CommandHangarV443 from '\.\/CommandHangarV443\.jsx'/);
  assert.match(hq, /resolveHqContextV443/);
  assert.match(hq, /commandHangarEnabledV443/);
  assert.match(hq, /onLaunch=\{prebattleV443 \? handleLaunch : null\}/);
  assert.match(hq, /clearHqContextV443/);
  assert.match(hq, /import CommandHangarV442 from '\.\/CommandHangarV442\.jsx'/);
  assert.match(hq, /commandHangarEnabledV442/);
});

test('Stage and Dungeon selections establish a pre-battle context before opening Headquarters', () => {
  const stage = read('src/components/StageSelect/index.jsx');
  const dungeon = read('src/components/DungeonSelect/index.jsx');
  assert.match(stage, /openCampaignPrebattleHqV443\(gsRef\)/);
  assert.match(stage, /openCampaignPrebattleHqV443\(gsRef\)[\s\S]{0,180}setScreen\(['"]hq['"]\)/);
  assert.match(dungeon, /openDungeonPrebattleHqV443\(gsRef\)/);
  assert.match(dungeon, /openDungeonPrebattleHqV443\(gsRef\)[\s\S]{0,180}setScreen\(['"]hq['"]\)/);
});

test('V4.4.3 Hangar uses icon-only neutral slots and hides launch in management mode', () => {
  const component = read('src/components/HQ/CommandHangarV443.jsx');
  const css = read('src/components/HQ/CommandHangarV443.module.css');
  for (const slot of ['mainGun', 'wingman', 'armor', 'drone', 'pilot', 'skill']) {
    assert.match(component, new RegExp(`slot="${slot}"`));
  }
  assert.doesNotMatch(component, /RankFrame|resolveCommandHangarRankFrameV442/);
  assert.match(component, /className=\{styles\.srOnly\}>\{accessible\}/);
  assert.match(component, /const prebattle = hangarMode === HQ_MODE_PREBATTLE_V443/);
  assert.match(component, /prebattle \? \(/);
  assert.match(component, /ĐỔI PHI CƠ/);
  assert.match(css, /\.loadoutSlot/);
  assert.match(css, /grid-template-areas:[\s\S]*"main hero wing"[\s\S]*"armor hero drone"[\s\S]*"pilot hero skill"/);
  assert.doesNotMatch(css, /rank_badges|sf_rank_frame_/);
});

test('V4.4.3 does not activate 3D model delivery or move combat authority into UI', () => {
  const component = read('src/components/HQ/CommandHangarV443.jsx');
  const navigation = read('src/game/navigation/HangarNavigationV443.js');
  assert.doesNotMatch(component, /battle\.start|battle\.finish|battle\.abandon|gameAction\(|firebase/i);
  assert.doesNotMatch(navigation, /fetch\(|gameAction\(/i);
  assert.match(component, /resolveCommandHangarShipPreviewV442/);
  assert.match(component, /Mô hình 3D sẽ được tải riêng/);
});

test('Package build gate includes V4.4.3 validation', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v443'], 'node --test tests/portalHangarNavigationV443.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v443/);
});
