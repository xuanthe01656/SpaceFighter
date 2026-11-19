import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const dir=process.cwd();
const read=(p)=>fs.readFileSync(path.join(dir,p),'utf8');
const portal=read('src/components/CampaignPortal/CampaignPortal.module.css');
const hq=read('src/components/HQ/CommandHangarV444.module.css');
const portalJsx=read('src/components/CampaignPortal/index.jsx');
const hqJsx=read('src/components/HQ/CommandHangarV444.jsx');
const pfx='.container[data-sf-portal-layout-v446="flight-hub"][data-sf-visual-v447="aurora-tactical"] ';
const hfx='.screen[data-sf-visual-v447="fleet-industrial"] ';
const cssRules=(text,sel)=>{
  const parsed=postcss.parse(text);
  const result=[];
  parsed.walkRules(r=>{if(r.selectors?.includes(sel))result.push(r)});
  return result;
};
const val=(text,sel,prop)=>{
  const rules=cssRules(text,sel);
  assert.ok(rules.length,`missing CSS selector ${sel}`);
  const values=[];
  for(const r of rules)r.walkDecls(prop,x=>values.push(x.value));
  assert.ok(values.length,`missing CSS property ${sel}: ${prop}`);
  return values[0];
};

test('V4410 optical alignment: Dungeon icon and title move together, not the button frame',()=>{
  assert.equal(val(portal,pfx+'.subModeBtn > .subModeIcon','transform'),'translate(var(--sf-dungeon-art-x),var(--sf-dungeon-art-y))');
  assert.match(val(portal,pfx.trimEnd(),'--sf-dungeon-art-x'),/clamp\(4px,1\.45vw,10px\)/);
  assert.equal(val(portal,pfx+'.subModeBtn > span:last-child','transform'),val(portal,pfx+'.subModeBtn > .subModeIcon','transform'));
  assert.equal(val(portal,pfx+'.actionArea > *','transform'),'none');
  assert.equal(val(portal,pfx+'.subModeBtn','border'),'0');
});

test('V4410 optical alignment: Campaign icon and 2-line copy move together, not button frame',()=>{
  assert.equal(val(portal,pfx+'.mainLaunchBtn > .launchIconBg','transform'),'translate(var(--sf-campaign-art-x),var(--sf-campaign-art-y))');
  assert.match(val(portal,pfx.trimEnd(),'--sf-campaign-art-y'),/clamp\(4px,\.75dvh,7px\)/);
  assert.equal(val(portal,pfx+'.mainLaunchBtn > .launchContent','transform'),val(portal,pfx+'.mainLaunchBtn > .launchIconBg','transform'));
  assert.equal(val(portal,pfx+'.mainLaunchBtn','border'),'0');
});

test('V4410 CTA safe-area preserves 2 native V3 artworks and compact phones',()=>{
  assert.match(val(portal,pfx+'.subModeBtn','background'),/sf_neo_button_01__dungeon_normal\.webp/);
  assert.match(val(portal,pfx+'.mainLaunchBtn','background'),/sf_neo_button_01__campaign_normal\.webp/);
  assert.match(portal,/@media \(max-width: 380px\) and \(orientation: portrait\)/);
  assert.match(portal,/--sf-dungeon-art-x: 3px;/);
  assert.match(portal,/--sf-campaign-art-y: 5px;/);
});

test('V4410 Portal retains 3 left 2 right 2 battle 4 dock; handlers unchanged',()=>{
  assert.equal((portalJsx.match(/data-sf-icon-v448=/g)||[]).length,9);
  assert.equal((portalJsx.match(/data-sf-hq-entry-v446=/g)||[]).length,1);
  for(const route of ["'hq'","'inventory'","'pilots'","'shop_campaign'","'galaxy_map'","'dungeon_select'"])
    assert.ok(portalJsx.includes(route),route);
  assert.equal(val(portal,pfx+'.actionArea','grid-template-areas'),'"dungeon campaign"');
  assert.match(val(portal,pfx+'.bottomNav','grid-template-columns'),/repeat\(4, minmax\(0,1fr\)\)/);
});

test('V4410 HQ uses same 6 loadout slots and manage/prebattle contract',()=>{
  for(const slot of ['mainGun','wingman','armor','drone','pilot','skill']) assert.match(hqJsx,new RegExp(`slot="${slot}"`));
  assert.match(hqJsx,/const prebattle = hangarMode === HQ_MODE_PREBATTLE_V444/);
  assert.match(hqJsx,/setSelectingSlot\('aircraft'\)/);
  assert.match(hqJsx,/onEquipItem/);
  assert.match(hqJsx,/onUnequipItem/);
  assert.match(hqJsx,/ownedIds\.map/);
});

test('V4410 HQ keeps its old layout metrics; visual changes are contained to surfaces',()=>{
  assert.match(val(hq,hfx+'.shipSelector','grid-template-areas'),/"prev identity cp next" "prev stars level next"/);
  assert.match(val(hq,hfx+'.hangarStage','grid-template-areas'),/"main hero wing" "armor hero drone" "pilot hero skill"/);
  assert.match(val(hq,hfx+'.actionBar','grid-template-columns'),/minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
  assert.equal(val(hq,hfx+'.actionBar','position'),'static');
  assert.match(val(hq,hfx+'.pilotPanel','grid-template-columns'),/66px/);
  assert.match(hq,/V4\.4\.10 finish pass/);
});

test('V4410 HQ visuals use real existing radar and ornament with no new resource URLs',()=>{
  const expected=['/assets/ui/spacefighter-hud-v3/scifi/sf_cyan_radar_01.webp','/assets/ui/spacefighter-hud-v3/scifi/sf_ornament_01__cyan.webp','/assets/ui/spacefighter-hud-v3/neo_buttons/sf_neo_button_01__campaign_normal.webp','/assets/ui/spacefighter-hud-v3/neo_buttons/sf_neo_button_03__campaign_normal.webp'];
  for(const url of expected)assert.ok(hq.includes(url),url);
  const urls=[...hq.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(urls)].sort(),expected.sort());
  assert.match(val(hq,hfx+'.loadoutSlot','border'),/1px/);
  assert.match(val(hq,hfx+'.hangarStage','background'),/radial-gradient/);
  assert.match(val(hq,hfx+'.pilotPortraitShell','border'),/pilot-tone/);
});

test('V4410 preserves V447/V448/V449 single-authority blocks, no new JS routes or DOM',()=>{
  assert.equal((portal.match(/\/\* V4\.4\.6 STRUCTURAL FLIGHT HUB/g)||[]).length,1);
  assert.equal((portal.match(/V4\.4\.9 restrained-glass balance/g)||[]).length,1);
  assert.equal((hq.match(/V4\.4\.7 FLEET INDUSTRIAL/g)||[]).length,1);
  assert.equal((portal.match(/V4\.4\.10 Native button optical alignment/g)||[]).length,1);
  assert.equal((hq.match(/V4\.4\.10 finish pass/g)||[]).length,1);
  assert.doesNotMatch(hq,/\.screen\s*\{[^}]*position:\s*fixed/s);
  assert.match(portal,/safe-area-inset-bottom/);
  assert.match(hq,/prefers-reduced-motion/);
});
