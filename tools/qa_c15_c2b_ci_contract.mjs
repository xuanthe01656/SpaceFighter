#!/usr/bin/env node
// Strict, dependency-free static safety gate for the separate manual C2B APK job.
// This does not claim server replay, trusted settlement or live endpoint parity.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] || '.');
const workflowFile = path.resolve(process.argv[3] || path.join(root, '.github/workflows/c15-dungeon-c2b-apk-qa.yml'));
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const yaml = fs.readFileSync(workflowFile, 'utf8');
const ensure = (ok, label) => assert.ok(ok, `C2B_CI_FAIL_${label}`);
const envValue = (name, value) => new RegExp(`^\\s+${name}:\\s*'${value}'\\s*$`, 'm').test(yaml);

ensure(/^on:\s*\n\s+workflow_dispatch:\s*$/m.test(yaml), 'MANUAL_ONLY');
ensure(!/^\s+(push|pull_request|schedule|workflow_run|repository_dispatch):/m.test(yaml), 'NO_AUTO_TRIGGER');
ensure(/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(yaml), 'READ_ONLY_GITHUB_PERMISSIONS');
ensure(/if:\s*github\.ref\s*==\s*'refs\/heads\/main'/.test(yaml), 'PIN_MAIN_BRANCH');
ensure(!/\b(gcloud\s+run\s+deploy|firebase\s+deploy|git\s+push|gh\s+release\s+create|npm\s+publish)\b/i.test(yaml), 'NO_DEPLOY_OR_PUSH');
ensure(envValue('VITE_SF_DUNGEON_QA', 'true'), 'DUNGEON_QA_FLAG');
ensure(envValue('VITE_SF_DUNGEON_V2C11_APK_TRACE', 'true'), 'TRACE_FLAG');
ensure(envValue('VITE_SF_DUNGEON_C2B_APK_QA', 'true'), 'C2B_FLAG');
ensure(envValue('VITE_SF_DUNGEON_QA_REWARDS', 'false'), 'NO_REWARDS_FLAG');
ensure(envValue('VITE_GAME_API_ENABLED', 'false'), 'LEGACY_API_OFF');
ensure(/VITE_GAME_API_URL:\s*https:\/\/spacefighter-api-staging-528039759292\.asia-southeast1\.run\.app\/api\/v1/.test(yaml), 'HTTPS_STAGING_API');
ensure(/VITE_SF_BUILD_CHANNEL:\s*staging-qa/.test(yaml), 'QA_ONLY_CHANNEL');
ensure(/retention-days:\s*1\s*$/m.test(yaml), 'ONE_DAY_APK');
ensure(/actions\/upload-artifact@v4/.test(yaml), 'EXACT_ONE_ARTIFACT');
ensure((yaml.match(/actions\/upload-artifact@v4/g) || []).length === 1, 'ONE_APK_ARTIFACT_ONLY');
ensure(/:app:assembleDebug/.test(yaml) && !/:app:assembleRelease|:app:bundleRelease/.test(yaml), 'DEBUG_ONLY');
ensure(/SF_ANDROID_QA_SIGNING_ENABLED:\s*'true'/.test(yaml), 'STABLE_QA_SIGNATURE');
ensure(/C2B_CI_SIGNED_APK_SHA_MATCH=PASS/.test(yaml), 'SIGNATURE_VERIFICATION');
ensure(!/GAME_C15_DUNGEON_C2B_(?:HMAC_KEY_HEX|ENABLED|APPROVED):/.test(yaml), 'NO_SERVER_FLAGS_OR_KEYS');

const api = source('client/src/services/gameApi.js');
const select = source('client/src/components/DungeonSelect/index.jsx');
const engine = source('client/src/components/Dungeon/DungeonEngine.jsx');
const contract = source('client/src/game/dungeon/DungeonC2BStagingQaContract.js');
const server = source('server/server.js');
const native = source('client/android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
ensure(api.includes("'/c15/dungeon/qa-c2b/ticket'") && api.includes('const BASE_URL = customUrl'), 'C2B_EXPLICIT_API_CALL');
ensure(select.includes('dungeonC2BRequested') && engine.includes('issueDungeonC2BTicket'), 'C2B_USER_OPT_IN');
ensure(contract.includes('VITE_SF_DUNGEON_C2B_APK_QA') && contract.includes('safeForSettlement!==false'), 'C2B_FAIL_CLOSED');
ensure(server.includes("app.post('/api/v1/c15/dungeon/qa-c2b/ticket'") &&
  server.includes("code:'C15_DUNGEON_C2B_DISABLED'"), 'C2B_SERVER_DISABLED_DEFAULT');
ensure(native.includes('if (BuildConfig.DEBUG) registerPlugin(SpaceFighterQaTraceExportPlugin.class)'), 'NATIVE_DEBUG_ONLY');
console.log('C2B_MANUAL_CI_STATIC_CONTRACT=PASS');
console.log('TRUE_APK_SERVER_PARITY=NOT_VERIFIED');
console.log('DUNGEON_REWARDS=LOCKED');
