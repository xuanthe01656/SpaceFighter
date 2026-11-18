import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = file => fs.readFileSync(path.join(process.cwd(),file),'utf8');
const portal = () => read('src/components/CampaignPortal/index.jsx');
const portalCss = () => read('src/components/CampaignPortal/CampaignPortal.module.css');
const hangarCss = () => read('src/components/HQ/CommandHangarV444.module.css');

function dockBody(s) {
  const index=s.indexOf('styles.bottomNav');
  assert.notEqual(index,-1);
  const end=s.indexOf('</motion.div>',index);
  assert.ok(end>index);
  return s.slice(index,end);
}
test('V446 Portal: no central Command Deck and exactly one HQ destination',()=>{
  const s=portal();
  assert.match(s,/data-sf-portal-layout-v446="flight-hub"/);
  assert.doesNotMatch(s,/PortalCommandDeckV444/);
  assert.equal((s.match(/data-sf-hq-entry-v446=/g)||[]).length,1);
  for(const legacy of ['data-sf-hq-entry-v443','data-sf-hq-entry-v444','data-sf-hq-entry="command-hangar-v4.4.2"']) assert.ok(!s.includes(legacy));
});
test('V446 Portal: management dock has four distinct real routes, no duplicates',()=>{
  const body=dockBody(portal());
  for(const route of ["'hq'","'inventory'","'pilots'","'shop_campaign'"])assert.match(body,new RegExp(route));
  for(const route of ["'hq'","'inventory'","'pilots'","'shop_campaign'"])assert.equal(body.split(route).length-1,1,`Duplicate ${route}`);
  assert.equal((body.match(/<button\b/g)||[]).length,4);
});
test('V446 Portal: campaign and dungeon CTAs preserve existing routes',()=>{
  const s=portal();
  assert.match(s,/handleNav\('galaxy_map'\)|setScreen\('galaxy_map'\)/);
  assert.match(s,/handleNav\('dungeon_select'\)|setScreen\('dungeon_select'\)/);
});
test('V446 Portal: one scoped CSS layout with distinct CTA and dock rows',()=>{
  const css=portalCss();
  assert.match(css,/V4\.4\.6 STRUCTURAL FLIGHT HUB/);
  assert.doesNotMatch(css,/\/\* V4\.4\.3 PORTAL MANAGEMENT DOCK/);
  assert.doesNotMatch(css,/\/\* V4\.4\.4 PORTAL COMMAND DECK/);
  assert.doesNotMatch(css,/\/\* V4\.4\.5 PORTAL LAYOUT LOCK/);
  assert.match(css,/grid-template-columns:\s*repeat\(4/);
  assert.match(css,/grid-template-areas:\s*"dungeon campaign"/);
  assert.match(css,/safe-area-inset-bottom/);
});
test('V446 HQ: panel is compact; ship and six functional slots remain',()=>{
  const css=hangarCss();
  const source=read('src/components/HQ/CommandHangarV444.jsx');
  assert.match(css,/V4\.4\.6: HQ is a management surface/);
  assert.match(css,/\.shipSelector[\s\S]*grid-template-areas:/);
  assert.match(css,/\.actionBar\s*\{[\s\S]*position:\s*static/);
  assert.doesNotMatch(css,/\/\* V4\.4\.5 COMMAND HANGAR LAYOUT LOCK/);
  for(const slot of ['mainGun','wingman','armor','drone','pilot','skill']) assert.match(source,new RegExp('slot="'+slot+'"'));
  assert.match(source,/const prebattle = hangarMode === HQ_MODE_PREBATTLE_V444/);
});
test('V446 does not remove legacy security, CDN, battle or profile gates',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v446'],'node --test tests/portalHangarStructuralV446.test.mjs');
  for(const v of ['v442','v443','v444','v445','v446'])assert.match(pkg.scripts.prebuild,new RegExp('check:ui-'+v));
  const hq=read('src/components/HQ/index.jsx');
  assert.match(hq,/onLaunch=\{prebattleV444 \? handleLaunch : null\}/);
});
