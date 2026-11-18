import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const balanced = source => (source.match(/\{/g) || []).length === (source.match(/\}/g) || []).length;

test('V446_STRUCTURAL_SUPERSESSION: single Portal layout separates CTA and four management routes', () => {
  const css = read('src/components/CampaignPortal/CampaignPortal.module.css');
  const jsx = read('src/components/CampaignPortal/index.jsx');
  assert.match(css, /V4\.4\.6 STRUCTURAL FLIGHT HUB/);
  assert.match(css, /\.bottomNav\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
  assert.match(css, /grid-template-areas:\s*"dungeon campaign"/);
  assert.doesNotMatch(jsx, /PortalCommandDeckV444/);
  assert.equal((jsx.match(/data-sf-hq-entry-v446=/g)||[]).length, 1);
  assert.equal(balanced(css), true);
});

test('V446_STRUCTURAL_SUPERSESSION: the unused V444 hero stays available for rollback but is not mounted', () => {
  const portal = read('src/components/CampaignPortal/index.jsx');
  assert.doesNotMatch(portal, /PortalCommandDeckV444/);
  assert.match(portal, /data-sf-portal-layout-v446="flight-hub"/);
});

test('V446_STRUCTURAL_SUPERSESSION: HQ action row stays in flow and six loadout slots are compact', () => {
  const css = read('src/components/HQ/CommandHangarV444.module.css');
  const jsx = read('src/components/HQ/CommandHangarV444.jsx');
  assert.match(css, /V4\.4\.6: HQ is a management surface/);
  const block = css.slice(css.indexOf('/* V4.4.6: HQ is a management surface'));
  assert.match(block, /\.actionBar\s*\{[\s\S]*?position:\s*static/);
  assert.match(block, /grid-template-columns:\s*minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
  assert.match(block, /min-height:\s*290px/);
  for(const slot of ['mainGun','wingman','armor','drone','pilot','skill']) assert.match(jsx,new RegExp('slot="'+slot+'"'));
  assert.equal(balanced(css), true);
});

test('package prebuild includes V4.4.5 layout gate', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v445'], 'node --test tests/portalHangarLayoutV445.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v444/);
  assert.match(pkg.scripts.prebuild, /check:ui-v445/);
});
