import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('V4.4B portal migration contract is immutable and presentation-only', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/ui-system/ProductPortalMigrationV441.js')).href;
  const portal = await import(`${moduleUrl}?test=${Date.now()}`);
  assert.equal(portal.PRODUCT_PORTAL_MIGRATION_VERSION_V441, 'product-portal-migration-v4.4b');
  assert.deepEqual(portal.auditProductPortalMigrationV441(), []);
  assert.equal(portal.resolveProductPortalContractV441('portal').role, 'entry-auth');
  assert.equal(portal.resolveProductPortalContractV441('campaign_portal').role, 'command-home');
  assert.equal(portal.resolveProductPortalContractV441('unknown').presentationOnly, true);
});

test('Portal consumes V4.4A primitives without changing auth and guest contracts', () => {
  const portal = read('src/components/Portal/index.jsx');
  assert.match(portal, /import GameButton from '\.\.\/\.\.\/ui-system\/GameButton\.jsx';/);
  assert.match(portal, /import GamePanel from '\.\.\/\.\.\/ui-system\/GamePanel\.jsx';/);
  assert.match(portal, /import GameIcon from '\.\.\/\.\.\/ui-system\/GameIconRegistry\.jsx';/);
  assert.match(portal, /import StatusBadge from '\.\.\/\.\.\/ui-system\/StatusBadge\.jsx';/);
  assert.match(portal, /PRODUCT_PORTAL_MIGRATION_VERSION_V441/);
  assert.match(portal, /data-sf-product-ui=\{PRODUCT_PORTAL_MIGRATION_VERSION_V441\}/);
  assert.match(portal, /data-sf-portal-step=\{step\}/);
  assert.match(portal, /<GamePanel[\s\S]*as=\{motion\.div\}/);
  assert.match(portal, /<GameButton[\s\S]*loginWithGoogle/);
  assert.match(portal, /<GameButton[\s\S]*handleGuestPlay/);
  assert.match(portal, /<StatusBadge/);
  assert.doesNotMatch(portal, /style=\{\{\s*background:\s*'transparent'[\s\S]*guestBtn/);

  // Existing behavior/authority remains in the screen controller.
  assert.match(portal, /await renamePlayer\(trimmedName\)/);
  assert.match(portal, /secureStorage\.getItem\('astro_guest_campaign'\)/);
  assert.match(portal, /setScreen\('campaign_portal'\)/);
  assert.match(portal, /platform !== 'ios'/);
  assert.match(portal, /platform === 'ios'/);
});

test('Campaign Portal delegates icon drawing and modal framing to the shared UI system', () => {
  const portal = read('src/components/CampaignPortal/index.jsx');
  assert.match(portal, /import GameIcon from '\.\.\/\.\.\/ui-system\/GameIconRegistry\.jsx';/);
  assert.match(portal, /import GamePanel from '\.\.\/\.\.\/ui-system\/GamePanel\.jsx';/);
  assert.match(portal, /import StatusBadge from '\.\.\/\.\.\/ui-system\/StatusBadge\.jsx';/);
  assert.match(portal, /PRODUCT_PORTAL_MIGRATION_VERSION_V441/);
  assert.match(portal, /data-sf-product-ui=\{PRODUCT_PORTAL_MIGRATION_VERSION_V441\}/);
  assert.match(portal, /const productIcon = name =>/);
  assert.match(portal, /Energy:\s*productIcon\('energy'\)/);
  assert.match(portal, /Map:\s*productIcon\('map'\)/);
  assert.doesNotMatch(portal, /const Icons = \{[\s\S]*<svg/);
  assert.match(portal, /<GamePanel[\s\S]*as=\{motion\.div\}[\s\S]*className=\{styles\.profileModal\}/);
  assert.match(portal, /<StatusBadge[\s\S]*profileStatus/);
  assert.doesNotMatch(portal, /style=\{\{\s*position:\s*'relative'\s*\}\}/);

  // Existing product behavior remains wired.
  assert.match(portal, /ensureGuestMissions/);
  assert.match(portal, /FirstTopupModal/);
  assert.match(portal, /AttendanceModal/);
  assert.match(portal, /saveUserProfile/);
  assert.match(portal, /deleteAccount/);
  assert.match(portal, /setScreen\('resource_manager'\)/);
  assert.match(portal, /handleNav\('galaxy_map'\)/);
  assert.match(portal, /handleNav\('dungeon_select'\)/);
});

test('Portal screen styles are scoped, token-driven and offline-safe', () => {
  const files = [
    'src/components/Portal/Portal.module.css',
    'src/components/CampaignPortal/CampaignPortal.module.css',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /@import\s+url/i, `${file} must not import runtime fonts`);
    assert.doesNotMatch(source, /fonts\.googleapis\.com/i, `${file} must not depend on Google Fonts`);
    assert.doesNotMatch(source, /(^|\n)\s*:root\s*\{/m, `${file} must not publish screen-local globals`);
    assert.match(source, /--sf-product-/);
    assert.match(source, /var\(--sf-product-/);
  }
  const portalCss = read(files[0]);
  const campaignCss = read(files[1]);
  assert.match(portalCss, /\.connectionBadge/);
  assert.match(campaignCss, /\.profileStatus/);
  assert.match(campaignCss, /\.badgedButton/);
  assert.match(campaignCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('shared icon registry covers Portal and Campaign Portal roles', () => {
  const icons = read('src/ui-system/GameIconRegistry.jsx');
  for (const name of [
    'language', 'logout', 'dice', 'apple', 'user', 'energy', 'coin', 'gem',
    'blueprint', 'gear', 'map', 'armory', 'barracks', 'shop', 'event', 'gift',
    'swords', 'mission', 'copy', 'crown',
  ]) {
    assert.match(icons, new RegExp(`\\b${name}:`), `missing shared icon: ${name}`);
  }
});

test('package gates include the V4.4B migration', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v441'], 'node --test tests/productPortalMigrationV441.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v440/);
  assert.match(pkg.scripts.prebuild, /check:ui-v441/);
});
