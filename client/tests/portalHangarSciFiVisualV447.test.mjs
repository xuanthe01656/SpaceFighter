import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const cwd=process.cwd();
const read=p=>fs.readFileSync(path.join(cwd,p),'utf8');
const portal=()=>read('src/components/CampaignPortal/index.jsx');
const hq=()=>read('src/components/HQ/CommandHangarV444.jsx');
const pcss=()=>read('src/components/CampaignPortal/CampaignPortal.module.css');
const hcss=()=>read('src/components/HQ/CommandHangarV444.module.css');
const count=(s,term)=>s.split(term).length-1;
const asset=p=>fs.readFileSync(path.join(cwd,'public',p));

function jsxDock(s){
  const at=s.indexOf('className={styles.bottomNav}');
  assert.ok(at>0,'Portal management dock not found');
  const end=s.indexOf('</motion.div>',at);
  assert.ok(end>at,'Portal dock close missing');
  return s.slice(at,end);
}
function balancedCss(s){
  // Remove comments and strings; detect unmatched block delimiters.
  const clean=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');
  let stack=0;
  for(const char of clean){if(char==='{')stack++;else if(char==='}'&&--stack<0)return false;}
  return stack===0;
}

test('V447 Portal: Aurora visual stays on single V446 structural root',()=>{
  const s=portal();
  assert.equal(count(s,'data-sf-portal-layout-v446="flight-hub"'),1);
  assert.equal(count(s,'data-sf-visual-v447="aurora-tactical"'),1);
  assert.doesNotMatch(s,/PortalCommandDeckV444/);
  assert.equal(count(s,'data-sf-hq-entry-v446="fleet-hub-v4.4.6"'),1);
  assert.doesNotMatch(s,/data-sf-hq-entry-v44[234]/);
});

test('V447 Portal: management dock has exactly four unique functional destinations',()=>{
  const s=jsxDock(portal());
  assert.equal((s.match(/<button\b/g)||[]).length,4);
  for(const route of ["'hq'","'inventory'","'pilots'","'shop_campaign'"])
    assert.equal(count(s,route),1,`route ${route} not unique`);
  const full=portal();
  assert.match(full,/handleNav\('galaxy_map'\)/);
  assert.match(full,/handleNav\('dungeon_select'\)/);
  assert.match(full,/openManagementHqV444\(gsRef\)/);
});

test('V447 Portal: canonical Aurora CSS replaces the V446 block, not additional overrides',()=>{
  const s=pcss();
  assert.equal(count(s,'V4.4.6 STRUCTURAL FLIGHT HUB'),1);
  assert.equal(count(s,'V4.4.7 AURORA TACTICAL'),1);
  assert.match(s,/grid-template-areas:\s*"dungeon campaign"/);
  assert.match(s,/grid-template-columns:\s*repeat\(4/);
  assert.match(s,/safe-area-inset-bottom/);
  assert.match(s,/prefers-reduced-motion/);
  assert.match(s,/:nth-child\(n\) \{ grid-column: auto; grid-row: auto; \}/);
  assert.doesNotMatch(s,/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/);
  assert.ok(balancedCss(s));
});

test('V447 Portal: existing background and optional V3 CTA assets remain real local resources',()=>{
  const s=pcss();
  assert.match(s,/\/images\/potal_bg169\.png/);
  assert.match(s,/sf_neo_button_01__campaign_normal\.webp/);
  assert.match(s,/sf_neo_button_01__dungeon_normal\.webp/);
  assert.match(s,/\.sideMenu\s*>\s*\*/);
  for(const file of [
    'assets/ui/spacefighter-hud-v3/neo_buttons/sf_neo_button_01__campaign_normal.webp',
    'assets/ui/spacefighter-hud-v3/neo_buttons/sf_neo_button_01__dungeon_normal.webp',
    'assets/ui/spacefighter-hud-v3/neo_buttons/sf_neo_button_03__campaign_normal.webp']) {
    const bytes=asset(file);
    assert.ok(bytes.byteLength>1024,`empty ${file}`);
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
  }
});

test('V447 HQ: Fleet Industrial skin preserves six equipment interactions and dual context',()=>{
  const s=hq();
  assert.equal(count(s,'data-sf-visual-v447="fleet-industrial"'),1);
  assert.match(s,/data-sf-hangar-mode=\{hangarMode\}/);
  assert.match(s,/const prebattle = hangarMode === HQ_MODE_PREBATTLE_V444/);
  for(const name of ['mainGun','wingman','armor','drone','pilot','skill'])assert.match(s,new RegExp('slot="'+name+'"'));
  assert.match(s,/\{prebattle \? \(/);
  assert.match(s,/onLaunch/);
  assert.match(s,/setSelectingSlot\('aircraft'\)/);
});

test('V447 HQ: radar and ornament visuals exist but are presentation-only',()=>{
  const s=hcss();
  assert.equal(count(s,'V4.4.6: HQ is a management surface'),1);
  assert.equal(count(s,'V4.4.7 FLEET INDUSTRIAL'),1);
  assert.match(s,/sf_cyan_radar_01\.webp/);
  assert.match(s,/sf_ornament_01__cyan\.webp/);
  assert.match(s,/\.actionBar\s*\{[\s\S]*?position:\s*static/);
  assert.match(s,/grid-template-columns:\s*minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
  assert.match(s,/min-height:\s*290px/);
  assert.ok(balancedCss(s));
  for(const file of [
    'assets/ui/spacefighter-hud-v3/scifi/sf_cyan_radar_01.webp',
    'assets/ui/spacefighter-hud-v3/scifi/sf_ornament_01__cyan.webp']) {
    const bytes=asset(file);
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
  }
});

test('V447: previous production checks and protected systems are not removed',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v447'],'node --test tests/portalHangarSciFiVisualV447.test.mjs');
  for(const version of ['v442','v443','v444','v445','v446','v447'])assert.match(pkg.scripts.prebuild,new RegExp('check:ui-'+version));
  const s=hq();
  assert.match(s,/COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442/);
  assert.match(s,/onEquip/);
  assert.match(s,/onUnequip/);
});
