import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const root = process.cwd();
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const portalJsx = source('src/components/CampaignPortal/index.jsx');
const portalCss = source('src/components/CampaignPortal/CampaignPortal.module.css');
const hangarCss = source('src/components/HQ/CommandHangarV444.module.css');
const hangarJsx = source('src/components/HQ/CommandHangarV444.jsx');
const p = '.container[data-sf-portal-layout-v446="flight-hub"][data-sf-visual-v447="aurora-tactical"] ';
const h = '.screen[data-sf-visual-v447="fleet-industrial"] ';
const rule = (css, sel) => {
  const root = postcss.parse(css);
  const entries=[];
  root.walkRules(node=>{ if(node.selectors.includes(sel)) entries.push(node); });
  const main = entries.filter(node => node.parent?.type !== 'atrule');
  assert.equal(main.length, 1, `Expected one base (non-media) rule for ${sel}`);
  const vals={};
  main[0].walkDecls(decl=>{ vals[decl.prop]=decl.value; });
  return vals;
};

test('V4411 Portal uses one real two-tier header without fake account actions', () => {
  assert.equal((portalJsx.match(/data-sf-portal-header-v4411="two-tier"/g) || []).length, 1);
  assert.equal((portalJsx.match(/className=\{styles.currencyLabel\}/g) || []).length, 5);
  assert.match(portalJsx, /\{playerName\}/);
  assert.match(portalJsx, /expData\.level/);
  assert.match(portalJsx, /currentUser \? .*TÀI KHOẢN/);
  assert.match(portalJsx, /setShowProfile\(true\)/);
  assert.doesNotMatch(portalJsx, /onClick=\{\(\) => .*fakeMail|fakeSettings/);
  assert.equal(rule(portalCss, p + '.topNav').display, 'grid');
  assert.match(rule(portalCss, p + '.topNav')['grid-template-rows'], /47px/);
  assert.equal(rule(portalCss, p + '.profileBtn').width, '100%');
  assert.match(rule(portalCss, p + '.currencyBar')['grid-template-columns'], /repeat\(5,minmax\(0,1fr\)\)/);
});

test('V4411 all five resource amounts retain original profile data sources', () => {
  for (const name of ['energy', 'coins', 'diamonds', 'blueprints', 'gear']) {
    assert.ok(portalJsx.includes(`formatCompactNumber(${name})`), name);
  }
  for (const className of ['chipEnergy','chipCoin','chipGem','chipBlueprint','chipGear']) {
    assert.ok(portalJsx.includes(`styles.${className}`), className);
  }
  assert.equal(rule(portalCss, p+'.currencyChip')['grid-template-areas'], "'icon amount' 'label label'");
  assert.equal(rule(portalCss, p+'.currencyLabel')['grid-area'], 'label');
});

test('V4411 selector card fits full 640x640 ship image', () => {
  const parent=rule(hangarCss,h+'.selectorPreview');
  const image=rule(hangarCss,h+'.selectorPreview > img');
  assert.equal(parent.position, 'relative');
  assert.match(parent['aspect-ratio'], /^1\s*\/\s*1$/);
  assert.equal(parent.overflow,'hidden');
  assert.equal(image.position,'absolute');
  assert.equal(image['object-fit'],'contain');
  assert.equal(image['object-position'],'center');
  assert.equal(image.width,'90%');
  assert.equal(image.height,'90%');
  const file=path.join(root,'public/images/hangar/ships/ship_xwing.webp');
  if(fs.existsSync(file)) {
    const b=fs.readFileSync(file);
    assert.equal(b.toString('ascii',0,4),'RIFF');
    assert.equal(b.toString('ascii',8,12),'WEBP');
    assert.ok(b.length>10_000);
  }
});

test('V4411 owned fleet card fits entire ship image and can still scroll', () => {
  assert.equal(rule(hangarCss,h+'.fleetPreview').position,'relative');
  assert.equal(rule(hangarCss,h+'.fleetPreview')['aspect-ratio'],'1 / 1');
  assert.equal(rule(hangarCss,h+'.fleetPreview > img')['object-fit'],'contain');
  assert.match(hangarCss,/\.fleetRail\s*\{\s*grid-auto-columns:\s*minmax\(135px,29%\)/);
  assert.match(hangarJsx,/className=\{styles\.fleetPreview\}/);
  assert.match(hangarJsx,/className=\{styles\.fleetImage\}/);
  assert.match(hangarJsx,/ownedIds\.map\(/);
});

test('V4411 appearance panel also uses contain, while HQ ship hero remains intact', () => {
  assert.equal(rule(hangarCss,h+'.appearancePreview').position,'relative');
  assert.equal(rule(hangarCss,h+'.appearancePreview > img')['object-fit'],'contain');
  assert.match(hangarCss,/\.shipImage\s*\{[\s\S]*object-fit:\s*contain/);
});

test('V4411 does not duplicate Portal dock or damage HQ navigation/gameplay contracts', () => {
  assert.equal((portalJsx.match(/data-sf-hq-entry-v446=/g)||[]).length,1);
  assert.equal((portalJsx.match(/data-sf-icon-v448=/g)||[]).length,9);
  for (const route of ["handleNav('galaxy_map')", "handleNav('dungeon_select')", "handleNav('inventory')", "handleNav('pilots')", "handleNav('shop_campaign')"]) {
    assert.ok(portalJsx.includes(route), route);
  }
  for(const slot of ['mainGun','wingman','armor','drone','pilot','skill']) assert.ok(hangarJsx.includes(`slot="${slot}"`),slot);
  for(const check of ['HQ_MODE_PREBATTLE_V444','onEquipItem','onUnequipItem','onLaunch','onBack','setSelectingSlot']) assert.ok(hangarJsx.includes(check),check);
});
