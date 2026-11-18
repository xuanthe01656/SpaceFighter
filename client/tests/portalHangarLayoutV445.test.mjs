import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const balanced = source => (source.match(/\{/g) || []).length === (source.match(/\}/g) || []).length;

test('V4.4.5 Portal layout resets legacy positioning and reserves separate CTA/dock rows', () => {
  const css = read('src/components/CampaignPortal/CampaignPortal.module.css');
  assert.match(css, /V4\.4\.5 PORTAL LAYOUT LOCK/);
  assert.match(css, /\.sideMenu\s*>\s*\*/);
  assert.match(css, /position:\s*absolute\s*!important/);
  assert.match(css, /\.actionArea\s*>\s*\*/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*\.72fr\)\s*minmax\(0,\s*1\.28fr\)/);
  assert.match(css, /\.bottomNav\s*>\s*\*/);
  assert.match(css, /position:\s*relative\s*!important/);
  assert.match(css, /\.bottomNav[^\{]*\{[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /\.bottomNav[^\n]*span[\s\S]*display:\s*block\s*!important/);
  assert.equal(balanced(css), true);
});

test('V4.4.5 central command deck fits between header and bottom controls', () => {
  const css = read('src/components/CampaignPortal/PortalCommandDeckV444.module.css');
  assert.match(css, /V4\.4\.5 PORTAL COMMAND DECK FIT/);
  assert.match(css, /bottom:\s*calc\(164px/);
  assert.match(css, /width:\s*clamp\(188px,\s*50vw,\s*420px\)/);
  assert.match(css, /min-height:\s*0/);
  assert.equal(balanced(css), true);
});

test('V4.4.5 Hangar action row is in document flow and mobile stage is compact', () => {
  const css = read('src/components/HQ/CommandHangarV444.module.css');
  assert.match(css, /V4\.4\.5 COMMAND HANGAR LAYOUT LOCK/);
  const block = css.slice(css.indexOf('/* V4.4.5 COMMAND HANGAR LAYOUT LOCK'));
  assert.match(block, /\.actionBar\s*\{[\s\S]*position:\s*static/);
  assert.doesNotMatch(block, /\.actionBar\s*\{[\s\S]{0,240}position:\s*fixed/);
  assert.match(block, /min-height:\s*312px/);
  assert.match(block, /max-height:\s*186px/);
  assert.match(block, /\.titleLockup h1[\s\S]*white-space:\s*normal/);
  assert.equal(balanced(css), true);
});

test('package prebuild includes V4.4.5 layout gate', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v445'], 'node --test tests/portalHangarLayoutV445.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v444/);
  assert.match(pkg.scripts.prebuild, /check:ui-v445/);
});
