import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveC15ReleaseChannel,C15_BUILD_CHANNEL_STAGING_QA,C15_BUILD_CHANNEL_RELEASE_CANDIDATE,C15_BUILD_CHANNEL_PRODUCTION} from '../src/config/C15ReleaseChannel.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const screen=fs.readFileSync(path.resolve(here,'../src/components/C15LocalAlpha1/index.jsx'),'utf8');
const api=fs.readFileSync(path.resolve(here,'../src/services/gameApi.js'),'utf8');
const session=fs.readFileSync(path.resolve(here,'../src/game/c15/C15Rc1bSession.js'),'utf8');

test('RC4 build channels are strict and production defaults fail closed',()=>{
  const qa=resolveC15ReleaseChannel({VITE_SF_BUILD_CHANNEL:C15_BUILD_CHANNEL_STAGING_QA,VITE_C15_RC3_ENABLED:'true'});
  assert.equal(qa.qaControls,true);assert.equal(qa.settlementClientEnabled,true);
  const rc=resolveC15ReleaseChannel({VITE_SF_BUILD_CHANNEL:C15_BUILD_CHANNEL_RELEASE_CANDIDATE,VITE_C15_RC4_CANARY_SETTLEMENT_ENABLED:'true',VITE_APP_VERSION:'1.2.1'});
  assert.equal(rc.qaControls,false);assert.equal(rc.releaseCandidate,true);assert.equal(rc.settlementClientEnabled,true);assert.equal(rc.appVersion,'1.2.1');
  const production=resolveC15ReleaseChannel({VITE_SF_BUILD_CHANNEL:C15_BUILD_CHANNEL_PRODUCTION,VITE_APP_VERSION:'1.2.1'});
  assert.equal(production.production,true);assert.equal(production.settlementClientEnabled,false);assert.equal(production.showDuplicateButton,false);
  assert.throws(()=>resolveC15ReleaseChannel({VITE_SF_BUILD_CHANNEL:'unknown'}),/Unsupported/);
  assert.throws(()=>resolveC15ReleaseChannel({VITE_SF_BUILD_CHANNEL:C15_BUILD_CHANNEL_PRODUCTION,VITE_C15_RC3_ENABLED:'true'}),/forbidden/);
  assert.throws(()=>resolveC15ReleaseChannel({VITE_SF_BUILD_CHANNEL:C15_BUILD_CHANNEL_RELEASE_CANDIDATE,VITE_C15_CONTROL_AB_QA:'true'}),/forbidden/);
});

test('RC4 release UI hides diagnostic controls while staging retains explicit QA tools',()=>{
  assert.match(screen,/releaseChannel\.showControlExport&&profile/);
  assert.match(screen,/releaseChannel\.showDuplicateButton/);
  assert.match(screen,/releaseChannel\.showDigestPrefixes/);
  assert.match(screen,/REWARD RECEIVED/);
  assert.match(screen,/C15 RC4 · RELEASE CANDIDATE/);
  assert.match(screen,/releaseChannel\.qaControls&&profileId===null/);
  assert.match(api,/'X-SF-App-Version':releaseChannel\.appVersion/);
  assert.match(api,/'X-SF-Build-Channel':releaseChannel\.id/);
  assert.match(session,/c15ReleaseChannelFromImportMeta/);
  assert.match(session,/settlementClientBuildEnabled=.*settlementClientEnabled/);
  assert.match(session,/rc3Enabled=settlementClientBuildEnabled\(\)/);
  assert.doesNotMatch(session,/const rc3BuildEnabled=.*VITE_C15_RC3_ENABLED/);
});
