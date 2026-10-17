import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const client = resolve(fileURLToPath(new URL('..', import.meta.url)));
const src = name => readFileSync(join(client, 'src', name), 'utf8');
const app = src('App.jsx');
const portal = src('components/Portal/index.jsx');
const portalCss = src('components/Portal/Portal.module.css');

test('Portal remains eager and all other screens lazy-load at module scope', () => {
  assert.match(app, /import Portal from '\.\/components\/Portal';/);
  const pages = [
    'HQ','Pilots','Inventory','CampaignEngine','StageSelect','CampaignPortal',
    'ShopCampaign','GalaxyMap','Missions','DungeonSelect','DungeonEngine','DungeonResult','Events',
  ];
  for (const page of pages.filter(x => !['CampaignEngine', 'DungeonEngine'].includes(x))) {
    assert.match(app, new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(`), `${page} should be dynamically imported`);
    assert.doesNotMatch(app, new RegExp(`import ${page} from`), `${page} must not be eager`);
  }
  assert.match(app, /const CampaignEngine = lazy\(loadCampaignEngine\)/);
  assert.match(app, /const DungeonEngine = lazy\(loadDungeonEngine\)/);
  assert.match(app, /import \{ loadCampaignEngine, loadDungeonEngine \} from '\.\/game\/routing\/BattleScreenLoaders'/);
  assert.match(app, /<Suspense fallback=/);
  assert.ok(app.indexOf('</Suspense>') < app.indexOf('<Toaster'));
});

test('battle/map Babylon engine never statically imported by App or Portal', () => {
  assert.doesNotMatch(app, /from ['"]@babylonjs/);
  assert.doesNotMatch(portal, /from ['"]@babylonjs/);
  assert.doesNotMatch(app, /^import CampaignEngine |^import DungeonEngine |^import GalaxyMap /m);
});

test('Portal background images resolve from public/ and deployment BASE_URL', () => {
  for (const id of ['portrait','landscape']) {
    const asset = join(client, 'public', 'images', `portal_${id}.png`);
    assert.ok(existsSync(asset), `${asset} must exist`);
    assert.match(portal, new RegExp(`images/portal_${id}\\.png`));
    assert.match(portalCss, new RegExp(`var\\(--portal-bg-${id}\\)`));
  }
  assert.match(portal, /import\.meta\.env\.BASE_URL/);
  assert.match(portal, /style=\{portalBackgrounds\}/);
  assert.doesNotMatch(portalCss, /url\(['"]?\.\.\/images\/portal_/);
});

test('HUD responsive and gameplay data are not modified by lazy routes', () => {
  assert.match(app, /<CampaignEngine gameAction=/);
  assert.match(app, /<DungeonEngine gameAction=/);
  assert.match(app, /<Missions gameAction=/);
  assert.match(app, /<Portal renamePlayer=/);
});

test('battle chunk loads before Cloud ticket or Guest energy transaction', () => {
  const loaders = src('game/routing/BattleScreenLoaders.js');
  const hq = src('components/HQ/index.jsx');
  assert.match(loaders, /import\('\.\.\/\.\.\/components\/Campaign\/CampaignEngine'\)/);
  assert.match(loaders, /import\('\.\.\/\.\.\/components\/Dungeon\/DungeonEngine'\)/);
  assert.match(hq, /await preloadBattleScreen\(mode\)/);
  assert.ok(hq.indexOf('await preloadBattleScreen(mode)') < hq.indexOf("gameAction('battle.start'"));
  assert.match(hq, /launchLockRef\.current=true;setIsLaunching\(true\)/);
});

test('failed lazy imports render a reload recovery screen rather than a blank WebView', () => {
  assert.match(app, /class ScreenLoadBoundary extends React\.Component/);
  assert.match(app, /static getDerivedStateFromError\(error\)/);
  assert.match(app, /<ScreenLoadBoundary key=\{screen\} lang=\{lang\}>/);
  assert.match(app, /window\.location\.reload\(\)/);
});
