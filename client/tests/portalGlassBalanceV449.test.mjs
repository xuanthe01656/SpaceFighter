import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const root=process.cwd();
const css=fs.readFileSync(path.join(root,'src/components/CampaignPortal/CampaignPortal.module.css'),'utf8');
const jsx=fs.readFileSync(path.join(root,'src/components/CampaignPortal/index.jsx'),'utf8');
const prefix='.container[data-sf-portal-layout-v446="flight-hub"][data-sf-visual-v447="aurora-tactical"] ';
const parsed=postcss.parse(css);
const value=(sel,property)=>{
  const nodes=[];
  const target=sel==='.container'?prefix.trimEnd():prefix+sel;
  parsed.walkRules(n=>{if(n.selectors.includes(target))nodes.push(n);});
  assert.ok(nodes.length>=1,`missing selector ${sel}`);
  const found=[];
  for(const node of nodes)node.walkDecls(property,d=>found.push(d.value));
  assert.ok(found.length,`missing ${property} in ${sel}`);
  return found[0];
};

function assertGlass(s,maxAlpha){
  const alphas=[...s.matchAll(/rgba\([^)]*,\s*(0?\.\d+|1(?:\.0+)?)\s*\)/g)].map(x=>Number(x[1]));
  assert.ok(alphas.length>=2,'expected dual-alpha glass gradient');
  assert.ok(alphas.every(v=>v<=maxAlpha),`opacity exceeds ${maxAlpha}: ${alphas}`);
  assert.doesNotMatch(s,/#[a-f0-9]{3,8}(?![a-f0-9])/i);
}

test('V449: keeps the V448 nine icon mappings and the four real dock routes',()=>{
  assert.equal((jsx.match(/data-sf-icon-v448=/g)||[]).length,9);
  assert.equal((jsx.match(/data-sf-hq-entry-v446=/g)||[]).length,1);
  assert.match(jsx,/handleNav\('shop_campaign'\)/);
  assert.match(jsx,/handleNav\('inventory'\)/);
  assert.match(jsx,/handleNav\('pilots'\)/);
  assert.match(value('.bottomNav','grid-template-columns'),/repeat\(4, minmax\(0,1fr\)\)/);
});

test('V449: profile and economy chips are lighter glass while remaining readable',()=>{
  const profile=value('.profileBtn','background');
  const money=value('.currencyChip','background');
  assertGlass(profile,.84);
  assertGlass(money,.84);
  // V4.4.11 intentionally replaces the obsolete 40vw side-by-side header.
  // Retain the transparency contract while testing the approved two-tier layout.
  assert.equal(value('.profileBtn','width'),'100%');
  assert.equal(value('.topNav','display'),'grid');
  assert.match(value('.currencyBar','grid-template-columns'),/repeat\(5,minmax\(0,1fr\)\)/);
  assert.equal((jsx.match(/className=\{styles.currencyLabel\}/g)||[]).length,5);
});

test('V449: side buttons use translucent clipped underlay, never opaque navy blocks',()=>{
  const under=value('.leftSidebar > *::before','background');
  assertGlass(under,.35);
  assert.equal(value('.leftSidebar > *','border'),'0');
  assert.equal(value('.leftSidebar > *','overflow'),'visible');
  assert.match(value('.leftSidebar > *::before','clip-path'),/polygon/);
  assert.equal(value('.leftSidebar > *::before','pointer-events'),'none');
});

test('V449: dock glass is transparent and four buttons stay text-legible',()=>{
  assertGlass(value('.bottomNav > *::before','background'),.46);
  assertGlass(value('.bottomNav [data-sf-hq-entry-v446]::before','background'),.52);
  assert.equal(value('.bottomNav > *','border'),'0');
  assert.equal(value('.bottomNav > *','clip-path'),'none');
  assert.match(value('.bottomNav > * > span:last-child','text-shadow'),/rgba/);
});

test('V449: CTA artwork remains native WebP; no extra border/background frame',()=>{
  for(const sel of ['.subModeBtn','.mainLaunchBtn']){
    assert.equal(value(sel,'border'),'0');
    assert.equal(value(sel,'box-shadow'),'none');
    assert.match(value(sel,'background'),/\.webp/);
  }
  assert.equal(value('.actionArea','grid-template-areas'),'"dungeon campaign"');
});

test('V449: balanced sizes with safe area and minimum 44px touch targets',()=>{
  assert.match(value('.container','--sf-hub-dock-h'),/clamp\(64px, 8\.0dvh, 76px\)/);
  assert.match(value('.container','--sf-hub-cta-h'),/clamp\(66px, 8\.7dvh, 78px\)/);
  assert.match(value('.container','--sf-hub-side-w'),/clamp\(72px, 19\.5vw, 102px\)/);
  assert.match(value('.sideMenu','grid-template-rows'),/clamp\(60px,7\.6dvh,73px\)/);
  assert.match(value('.actionArea','bottom'),/--sf-hub-dock-h\) \+ 14px/);
  assert.match(value('.bottomNav','bottom'),/--sf-hub-safe-bottom/);
  assert.match(value('.container','--sf-hub-safe-bottom'),/safe-area-inset-bottom/);
});

test('V449: notification remains outside clipping, V448 images stay visible without a frame',()=>{
  assert.match(css,/> :not\(\.notiBadge\)/);
  assert.match(css,/\.assetIconV448\[hidden\] \{ display: none !important; \}/);
  assert.equal(value('.leftSidebar > *','overflow'),'visible');
  assert.equal(value('.bottomNav > *','overflow'),'visible');
  assert.equal(value('[data-sf-icon-v448] :is(.sideIcon,.navIcon,.subModeIcon,.launchIconBg)','background'),'transparent');
});

test('V449: does not stack a second Portal contract after the V448/V449 block',()=>{
  assert.equal((css.match(/\/\* V4\.4\.6 STRUCTURAL FLIGHT HUB/g)||[]).length,1);
  assert.equal((css.match(/V4\.4\.9 restrained-glass balance/g)||[]).length,1);
  assert.doesNotMatch(css,/data-sf-portal-layout-v449=/);
  assert.doesNotMatch(value('.leftSidebar > *::before','background'),/blur\(/);
});

test('V449: portrait small-screen and landscape rules both present',()=>{
  assert.match(css,/@media \(max-width: 380px\) and \(orientation: portrait\)/);
  assert.match(css,/@media \(max-height: 700px\) and \(orientation: portrait\)/);
  assert.match(css,/@media \(orientation: landscape\) and \(max-height: 600px\)/);
  assert.match(css,/height: 65px;/);
});
