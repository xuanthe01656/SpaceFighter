import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const cwd=process.cwd();
const read=x=>fs.readFileSync(path.join(cwd,x),'utf8');
const portal=()=>read('src/components/CampaignPortal/index.jsx');
const pcss=()=>read('src/components/CampaignPortal/CampaignPortal.module.css');
const hcss=()=>read('src/components/HQ/CommandHangarV444.module.css');
const count=(s,k)=>s.split(k).length-1;
const roles={
  topup:'portal_topup_reward.webp',attendance:'portal_attendance_calendar.webp',events:'portal_event.webp',
  missions:'portal_missions.webp',headquarters:'portal_headquarters.webp',inventory:'portal_inventory.webp',
  pilots:'portal_pilots.webp',dungeon:'portal_dungeon.webp',campaign:'portal_campaign.webp'
};
function cssBody(css,selector){
  const p=css.indexOf(selector);assert.ok(p>=0,`missing ${selector}`);
  const start=css.indexOf('{',p),end=css.indexOf('}',start);
  assert.ok(start>=p&&end>start);
  return css.slice(start+1,end);
}
const pr='.container[data-sf-portal-layout-v446="flight-hub"][data-sf-visual-v447="aurora-tactical"] ';
const hr='.screen[data-sf-visual-v447="fleet-industrial"] ';

test('V448: all nine source icons are bundled as compact alpha-friendly offline WebPs',()=>{
  let size=0;
  for(const filename of Object.values(roles)){
    const f=path.join(cwd,'public/assets/ui/spacefighter-portal-icons-v448',filename);
    const b=fs.readFileSync(f);size+=b.length;
    assert.equal(b.toString('ascii',0,4),'RIFF');
    assert.equal(b.toString('ascii',8,12),'WEBP');
    assert.ok(b.length>2000&&b.length<60000,`unexpected bytes: ${filename}`);
  }
  assert.ok(size<=250_000,`icon payload too large: ${size}`);
});

test('V448: icon role is attached to its real Portal click handler, never a positional nth-child',()=>{
  const s=portal();
  for(const [role,name] of Object.entries(roles)){
    assert.equal(count(s,`data-sf-icon-v448="${role}"`),1,`missing role ${role}`);
    assert.equal(count(s,`BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/${name}'`),1,`wrong path ${name}`);
  }
  assert.equal(count(s,'className={styles.assetIconV448}'),9);
  assert.equal(count(s,"dataset.sfIconFallback = 'true'"),9);
  assert.equal(count(s,'data-sf-hq-entry-v446="fleet-hub-v4.4.6"'),1);
  assert.doesNotMatch(s,/PortalCommandDeckV444/);
  for(const required of ["handleNav('inventory')","handleNav('pilots')","handleNav('shop_campaign')","handleNav('dungeon_select')","handleNav('galaxy_map')",'openManagementHqV444(gsRef)'])assert.ok(s.includes(required),required);
});

test('V448: WebP CTA artwork owns its own frame: no CSS border, gradient wrapper, fill rectangle or glow ring',()=>{
  const s=pcss();
  for(const sel of ['.subModeBtn {','.mainLaunchBtn {']){
    const block=cssBody(s,pr+sel);
    assert.match(block,/border:\s*0;/);
    assert.match(block,/box-shadow:\s*none;/);
    assert.match(block,/background:\s*url\(/);
    assert.match(block,/no-repeat transparent;/);
    assert.doesNotMatch(block,/background:\s*(?:linear-gradient|#[0-9a-f]{3,8})/i);
  }
  const inner=cssBody(s,pr+'.launchIconBg {');
  assert.match(inner,/border:\s*0;/);
  assert.match(inner,/background:\s*transparent;/);
  assert.match(cssBody(s,pr+'.actionArea > * {'),/border-radius:\s*0;/);
});

test('V448: Portal utility buttons and management dock use borderless clipped panels, not doubled rectangles',()=>{
  const s=pcss();
  for(const sel of ['.leftSidebar > * {','.bottomNav > * {']){
    const b=cssBody(s,pr+sel);
    assert.match(b,/border:\s*0;/);
    assert.match(b,/clip-path:\s*none;/);
    assert.match(b,/overflow:\s*visible;/);
    assert.doesNotMatch(b,/inset\s+[02]px\s+0\s+0/);
  }
  // Angular panel styling lives in a noninteractive underlay, never clip the red notification badge.
  for(const sel of ['.leftSidebar > *::before {','.bottomNav > *::before {']){
    const b=cssBody(s,pr+sel);
    assert.match(b,/clip-path:\s*polygon/);
    assert.match(b,/pointer-events:\s*none;/);
  }
  assert.match(s,/> :not\(\.notiBadge\)/);
  assert.match(s,/\[data-sf-icon-v448\] \.assetIconV448/);
  assert.match(s,/\[data-sf-icon-fallback="true"\]/);
  assert.match(s,/\.assetIconV448\[hidden\] \{ display: none !important; \}/);
  assert.match(s,/focus-visible/);
});

test('V448: management Footer retains exact four destinations and readable text, no alternative HQ or prebattle shortcut',()=>{
  const s=portal();const p=s.indexOf('className={styles.bottomNav}');
  assert.ok(p>=0);
  const end=s.indexOf('</motion.div>',p);assert.ok(end>p);
  const dock=s.slice(p,end);
  assert.equal(count(dock,'<button'),4);
  for(const route of ["handleNav('inventory')","handleNav('pilots')","handleNav('shop_campaign')","handleNav('hq')"])assert.equal(count(dock,route),1);
  assert.equal(count(dock,'data-sf-hq-entry-v446'),1);
});

test('V448: HQ keeps equipment cards and ship stage borders; only the two pre-framed WebP CTA buttons lose CSS borders',()=>{
  const s=hcss();
  for(const sel of ['.actionBar .primaryAction {','.actionBar .secondaryAction {']){
    const b=cssBody(s,hr+sel);
    assert.match(b,/border:\s*0;/);
    assert.match(b,/background:\s*url\(/);
    assert.match(b,/no-repeat transparent;/);
  }
  assert.match(cssBody(s,hr+'.loadoutSlot {'),/border:\s*1px/);
  assert.match(cssBody(s,hr+'.pilotPanel {'),/grid-template-columns:/);
  assert.match(s,/sf_cyan_radar_01\.webp/);
});

test('V448: stays presentation-only, no new catalog, 3D, economy or authority code',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v448'],'node --test tests/portalAssetNativeIconsV448.test.mjs');
  for(const v of ['v446','v447','v448'])assert.match(pkg.scripts.prebuild,new RegExp('check:ui-'+v));
  const s=portal();
  assert.equal(count(s,'data-sf-visual-v447="aurora-tactical"'),1);
  assert.doesNotMatch(s,/data-sf-visual-v448="/);
});
