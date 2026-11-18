import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const importFresh = relative => import(`${pathToFileURL(path.join(root, relative)).href}?v444=${Date.now()}-${Math.random()}`);

test('V4.4.4 navigation separates management and prebattle HQ while normalizing old profiles', async () => {
  const nav = await importFresh('src/game/navigation/HangarNavigationV444.js');
  assert.equal(nav.PORTAL_HANGAR_VERSION_V444, 'portal-hangar-v4.4.4');
  assert.deepEqual(nav.auditHangarNavigationV444(), []);
  const progress = nav.normalizeCampaignProgressV444({ currentStage: 3 });
  assert.equal(progress.currentPlanet, 1);
  assert.equal(progress.selectedStage, 3);
  assert.equal(nav.createManagementHqContextV444().mode, 'manage');
  assert.equal(nav.createPrebattleHqContextV444({ battleMode: 'dungeon' }).returnScreen, 'dungeon_select');
});

test('pilot catalog always ends with an app-local fallback for all eight pilots', async () => {
  const catalog = await importFresh('src/game/assets/PilotVisualCatalogV444.js');
  assert.equal(catalog.PILOT_VISUAL_IDS_V444.length, 8);
  assert.deepEqual(catalog.auditPilotVisualCatalogV444(), []);
  for (const id of catalog.PILOT_VISUAL_IDS_V444) {
    const candidates = catalog.resolvePilotPortraitCandidatesV444({ id, imgSrc: `/missing/${id}.png` });
    assert.equal(candidates.at(-1), `/images/hangar/pilots/${id}.webp`);
    const file = path.join(root, 'public', candidates.at(-1).replace(/^\//, ''));
    assert.equal(fs.existsSync(file), true, `missing fallback ${id}`);
    assert.ok(fs.statSync(file).size > 1000, `empty fallback ${id}`);
  }
});

test('reliable image component advances candidates and never reuses a broken src as its only fallback', () => {
  const source = read('src/ui-system/ReliableAssetImageV444.jsx');
  assert.match(source, /normalizeCandidates/);
  assert.match(source, /setSourceIndex\(index => Math\.min\(index \+ 1, sources\.length\)\)/);
  assert.match(source, /if \(!source\)/);
  assert.match(source, /data-sf-reliable-image/);
  assert.doesNotMatch(source, /const resolved = failed \? fallback : src/);
});

test('V446_STRUCTURAL_SUPERSESSION: Portal retains original mission routes but removes central Command Deck', () => {
  const portal = read('src/components/CampaignPortal/index.jsx');
  const css = read('src/components/CampaignPortal/CampaignPortal.module.css');
  assert.doesNotMatch(portal, /PortalCommandDeckV444/);
  assert.doesNotMatch(portal, /data-sf-hq-entry-v44[234]/);
  assert.match(portal, /data-sf-hq-entry-v446/);
  assert.match(portal, /openManagementHqV444/);
  assert.match(portal, /handleNav\('galaxy_map'\)/);
  assert.match(portal, /handleNav\('dungeon_select'\)/);
  assert.match(css, /V4\.4\.6 STRUCTURAL FLIGHT HUB/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
});

test('Command Hangar V4.4.4 removes badge-frame misuse and guarantees pilot visual fallback', () => {
  const hq = read('src/components/HQ/index.jsx');
  const hangar = read('src/components/HQ/CommandHangarV444.jsx');
  assert.match(hq, /CommandHangarV444/);
  assert.match(hq, /resolveHqContextV444/);
  assert.match(hq, /onLaunch=\{prebattleV444 \? handleLaunch : null\}/);
  assert.match(hangar, /resolvePilotPortraitCandidatesV444/);
  assert.match(hangar, /ReliableAssetImageV444/);
  assert.match(hangar, /data-sf-hangar-mode=\{hangarMode\}/);
  assert.doesNotMatch(hangar, /function RankFrame/);
  assert.doesNotMatch(hangar, /2D LOCAL · 3D OPTIONAL/);
});

test('Stage and Dungeon selection set explicit prebattle context and profile defaults prevent blank returns', () => {
  const stage = read('src/components/StageSelect/index.jsx');
  const dungeon = read('src/components/DungeonSelect/index.jsx');
  const defaults = read('src/game/catalog/profileDefaults.js');
  assert.match(stage, /openCampaignPrebattleHqV444\(gsRef\)/);
  assert.match(stage, /normalizeCampaignProgressV444/);
  assert.match(dungeon, /openDungeonPrebattleHqV444\(gsRef\)/);
  assert.match(defaults, /currentPlanet:\s*1/);
  assert.match(defaults, /selectedStage:\s*1/);
});

test('V446_STRUCTURAL_SUPERSESSION: keeps historic navigation helpers but only one live HQ entry', () => {
  const pkg = JSON.parse(read('package.json'));
  if (!pkg.scripts['check:ui-v443']) return;
  const portal = read('src/components/CampaignPortal/index.jsx');
  const hq = read('src/components/HQ/index.jsx');
  const stage = read('src/components/StageSelect/index.jsx');
  const dungeon = read('src/components/DungeonSelect/index.jsx');
  assert.match(portal, /openManagementHqV444/);
  assert.doesNotMatch(portal, /data-sf-hq-entry-v443/);
  assert.match(portal, /data-sf-hq-entry-v446/);
  assert.match(hq, /CommandHangarV443/);
  assert.match(hq, /commandHangarEnabledV443/);
  assert.match(stage, /openCampaignPrebattleHqV443\(gsRef\)/);
  assert.match(dungeon, /openDungeonPrebattleHqV443\(gsRef\)/);
});

test('package prebuild includes V4.4.4 gate without removing previous gates', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v444'], 'node --test tests/portalCommandDeckV444.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v440/);
  assert.match(pkg.scripts.prebuild, /check:ui-v441/);
  assert.match(pkg.scripts.prebuild, /check:ui-v442/);
  assert.match(pkg.scripts.prebuild, /check:ui-v444/);
});
