import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const workflow = fs.readFileSync(path.join(repo, '.github/workflows/android-native-smoke.yml'), 'utf8');

const envLine = (name) => workflow.split(/\r?\n/).find(line => line.includes(`${name}:`)) || '';

test('V4.2.1 exposes one explicit unified Campaign and Dungeon QA build input', () => {
  assert.match(workflow, /unified_campaign_dungeon_qa:/);
  assert.match(workflow, /Build one local-only Campaign \+ Dungeon Unified HUD\/skills QA APK/);
});

test('the unified input enables both isolated runtimes without enabling rewards or Game API', () => {
  assert.match(envLine('VITE_SF_GUEST_ABILITIES_QA'), /unified_campaign_dungeon_qa/);
  assert.match(envLine('VITE_SF_GUEST_COMBAT_V2_QA'), /unified_campaign_dungeon_qa/);
  assert.match(envLine('VITE_SF_DUNGEON_QA'), /unified_campaign_dungeon_qa/);
  assert.match(envLine('VITE_SF_UNIFIED_CAMPAIGN_DUNGEON_QA'), /unified_campaign_dungeon_qa/);
  assert.match(workflow, /VITE_SF_DUNGEON_QA_REWARDS: 'false'/);
  assert.match(workflow, /VITE_GAME_API_ENABLED: 'false'/);
});

test('the unified build is manual-only, staging-only and isolated from Cloud C15 and legacy QA inputs', () => {
  assert.match(workflow, /Unified Campaign \+ Dungeon QA is manual-only/);
  assert.match(workflow, /Unified QA must remain local-only on staging-qa/);
  assert.match(workflow, /Use only the unified QA checkbox for the combined build/);
  assert.match(workflow, /Unified QA cannot be combined with C15 release candidates/);
  assert.match(workflow, /NO CLOUD, NO REWARDS, NO TRUSTED WRITES, NOT FOR RELEASE/);
});

test('the Android fast gate and artifact naming recognize the unified build', () => {
  assert.match(workflow, /inputs\.unified_campaign_dungeon_qa.*gate:c15-rc7:fast/s);
  assert.match(workflow, /spacefighter-android-unified-campaign-dungeon-v421-qa-debug-no-rewards/);
  assert.ok(workflow.indexOf('inputs.unified_campaign_dungeon_qa') < workflow.indexOf("name='spacefighter-android-dungeon-v398"));
});
