import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('RC7 Android local plugin uses app-private storage, resumable HTTPS and verified atomic activation',()=>{
  const java=read('client/android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterAssetStorePlugin.java');
  const activity=read('client/android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
  for(const marker of ['@CapacitorPlugin(name = "SpaceFighterAssetStore")','getContext().getFilesDir()',
    'connection.setRequestProperty("Range"','MessageDigest.getInstance("SHA-256")','".part"',
    'Asset download cancelled','downloadProgress','handleOnDestroy','Explicit downloaded-assets scope required'])assert.match(java,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(java,/getExternalStorage|Environment\.getExternal/);
  const payload=read('client/src/game/assets/AssetPayloadStoreV1.js');
  assert.match(payload,/isPluginAvailable\?\.\('SpaceFighterAssetStore'\)/);
  assert.match(payload,/C15_NATIVE_ASSET_STORE_UNAVAILABLE/);
  const register=activity.indexOf('registerPlugin(SpaceFighterAssetStorePlugin.class)');
  const superCreate=activity.indexOf('super.onCreate(savedInstanceState)');
  assert.ok(register>=0&&superCreate>register,'local plugin must register before BridgeActivity onCreate');
});

test('RC7 candidate consumes all three pilot pack visuals and exposes progress without changing hitboxes',()=>{
  const component=read('client/src/components/C15LocalAlpha1/index.jsx');
  const renderer=read('client/src/components/C15LocalAlpha1/C15LocalRenderer.js');
  for(const marker of ['alpha_coast_low.webp','ship_xwing_top.png','p1_small_sheet.webp','Đang tải tài nguyên'])
    assert.match(component,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(renderer,/pilotTextureUrl/);assert.match(renderer,/enemyAtlasUrl/);
  assert.match(renderer,/remotePilot/);assert.match(renderer,/remoteEnemyAtlas/);
  assert.doesNotMatch(renderer,/collision.*texture|texture.*collision/i);
});

test('RC7 workflow is manual for Android candidate and becomes the sole main-push C15 gate',()=>{
  const android=read('.github/workflows/android-native-smoke.yml');
  const rc6=read('.github/workflows/c15-rc6-gate.yml');
  const rc7=read('.github/workflows/c15-rc7-gate.yml');
  assert.match(android,/c15_rc7_assets:/);assert.match(android,/VITE_C15_RC7_ASSET_DELIVERY_ENABLED/);
  assert.match(android,/spacefighter-android-c15-rc7-asset-delivery-candidate/);
  assert.doesNotMatch(rc6,/^\s*push:/m);assert.match(rc7,/^\s*push:/m);assert.match(rc7,/npm run gate:c15-rc7/);
});

test('RC7 server supports external immutable data plane while retaining Cloud Run fallback',()=>{
  const catalog=read('server/lib/c15Rc1bResourceCatalog.cjs');
  const server=read('server/server.js');const exporter=read('server/tools/exportC15AssetPacks.cjs');
  assert.match(catalog,/assetBaseUrl/);assert.match(catalog,/externalAssetDelivery/);
  assert.match(server,/GAME_C15_ASSET_BASE_URL/);assert.match(server,/GAME_C15_ASSET_PATH_PREFIX/);
  assert.match(exporter,/gcloud storage rsync/);assert.match(exporter,/gcs-cors\.json/);
  assert.match(exporter,/SHA256SUMS\.txt/);
});
