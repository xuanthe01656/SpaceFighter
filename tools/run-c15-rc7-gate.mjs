import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const npmCli=String(process.env.npm_execpath||'').trim();
const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,'');
function npmCommand(args){if(npmCli)return {command:process.execPath,args:[npmCli,...args]};if(process.platform==='win32')return {command:process.env.ComSpec||'cmd.exe',args:['/d','/s','/c',['npm.cmd',...args].join(' ')]};return {command:'npm',args};}
function run(label,command,args,cwd=root,{capture=false,env={}}={}){console.log(`\n=== ${label} ===`);const options={cwd,env:{...process.env,...env},maxBuffer:128*1024*1024};
  if(capture){options.encoding='utf8';options.stdio=['inherit','pipe','pipe'];}else options.stdio='inherit';const out=spawnSync(command,args,options);
  if(capture){if(out.stdout)process.stdout.write(out.stdout);if(out.stderr)process.stderr.write(out.stderr);}if(out.error)throw out.error;if(out.status!==0)throw new Error(`${label} failed with exit ${out.status}`);return capture?`${out.stdout||''}\n${out.stderr||''}`:'';}
function runNpm(label,args,cwd,options){const cmd=npmCommand(args);return run(label,cmd.command,cmd.args,cwd,options);}
function requireZeroSkip(label,command,args,cwd){const output=stripAnsi(run(label,command,args,cwd,{capture:true}));const fail=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*fail\s+(\d+)/g)],skip=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*skipped\s+(\d+)/g)];
  if(!fail.length||!skip.length)throw new Error(`${label} TAP summary missing`);if(Number(fail.at(-1)[1])!==0||Number(skip.at(-1)[1])!==0)throw new Error(`${label} requires 0 FAIL / 0 SKIP`);}
const fast=process.argv.includes('--fast');
run('C15 BROWSER KERNEL SOURCE CHECK',process.execPath,[path.join(root,'client/scripts/generate-c15-browser-kernel.mjs'),'--check']);
if(fast){
  requireZeroSkip('RC7 TARGETED CLIENT TEST',process.execPath,['--test',
    'tests/resourceManifestV1.test.mjs','tests/c15Rc1bResourceDelivery.test.mjs','tests/c15Rc1bIndexedDbSafety.test.mjs',
    'tests/c15Rc7AssetPayloadStore.test.mjs','tests/c15Rc7StartupDownloads.test.mjs',
    'tests/c15Rc7CommercialPresentation.test.mjs',
    'tests/guestAircraftAbilitiesLabV1.test.mjs','tests/guestCombatFoundationV2.test.mjs',
    'tests/guestAbilityFeedbackV2.test.mjs','tests/guestCombatQaBuildGateV2.test.mjs','tests/enemyCombatFoundationV2.test.mjs','tests/sharedCombatModePolicyV2.test.mjs',
    'tests/gameplayPhase2.test.mjs','tests/combatCampaignAlphaAIC6DV8.test.mjs',
    'tests/g1g2C15VisualViewport.test.mjs','tests/g1g2HudTopPlacement.test.mjs','tests/c15BattleVisualParity.test.mjs','tests/g1g2UnifiedUi.test.mjs','tests/g1g2F12PresentationParity.test.mjs','tests/g1g2SciFiTacticalPresentation.test.mjs','tests/g1g2NotchSafeBattleHud.test.mjs','tests/approvedTacticalHudV4.test.mjs',
    'tests/c15ControlIntent.test.mjs','tests/c15PointerController.test.mjs',
    'tests/c15Rc7RemoteAssetDeliveryProduction.test.mjs','tests/c15Rc1bSessionLifecycle.test.mjs',
    'tests/c15Rc1bRuntimeGate.test.mjs','tests/c15Rc4WorkflowTopology.test.mjs','tests/c15Rc4ReleaseChannel.test.mjs',
    'tests/missionSync212.test.mjs','tests/c15Rc5AndroidProduction.test.mjs',
    'tests/c15Rc6AndroidRelease.test.mjs','tests/nativeAndroidSocialLoginBridge.test.mjs'],path.join(root,'client'));
  requireZeroSkip('RC7 TARGETED SERVER TEST',process.execPath,['--test',
    'tests/resourceManifestV1.test.cjs','tests/c15Rc1bResourceCatalog.test.cjs','tests/c15Rc1bRuntimeV1.test.cjs','tests/c15Rc7AssetExport.test.cjs','tests/c15Rc4ReleaseGateV1.test.cjs',
    'tests/accountDeletionV6.test.cjs','tests/leaderboardContractV1.test.cjs'],path.join(root,'server'));
}else{
  const client=stripAnsi(runNpm('FULL CLIENT TEST',['test'],path.join(root,'client'),{capture:true}));
  const server=stripAnsi(runNpm('FULL SERVER TEST',['test'],path.join(root,'server'),{capture:true}));
  for(const [label,output] of [['CLIENT',client],['SERVER',server]]){const fail=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*fail\s+(\d+)/g)],skip=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*skipped\s+(\d+)/g)];
    if(!fail.length||!skip.length||Number(fail.at(-1)[1])!==0||Number(skip.at(-1)[1])!==0)throw new Error(`${label} full suite requires 0 FAIL / 0 SKIP`);}
  runNpm('RC7 REMOTE ASSET DELIVERY WEBVIEW BUILD',['run','build'],path.join(root,'client'),{env:{VITE_SF_BUILD_CHANNEL:'release-candidate',
    VITE_APP_VERSION:'1.2.3',VITE_C15_RC1B_ENABLED:'true',VITE_C15_RC3_ENABLED:'false',
    VITE_C15_RC4_CANARY_SETTLEMENT_ENABLED:'true',VITE_C15_RC5_CONTROL_ENABLED:'true',
    VITE_C15_RC7_ASSET_DELIVERY_ENABLED:'true',VITE_C15_CONTROL_AB_QA:'false',VITE_C15_CONTROL_PROFILE_ID:'arcade-responsive-v2'}});
}
const output=path.join(root,'client/dist/c15-rc7');fs.mkdirSync(output,{recursive:true});
run('RC7 REMOTE ASSET DELIVERY EVIDENCE',process.execPath,[path.join(root,'server/tools/generateC15Rc7Evidence.cjs'),'--output-dir',output]);
run('RC7 STATIC PACK EXPORT EVIDENCE',process.execPath,[path.join(root,'server/tools/exportC15AssetPacks.cjs'),
  '--asset-base-url','https://storage.googleapis.com/spacefighter-rc7-evidence','--output-dir',path.join(output,'asset-export')]);
const report=JSON.parse(fs.readFileSync(path.join(output,'C15_RC7_GATE_REPORT.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(output,'C15_RC7_ASSET_DELIVERY_MANIFEST.json'),'utf8'));
if(report.status!=='PASS'||report.delivery?.nativeStore!==true||report.delivery?.dualStore!==true||report.delivery?.integrity!==true
  ||report.delivery?.progress!==true||report.delivery?.runtimeConsumesPack!==true||report.delivery?.cloudRunFallback!==true
  ||report.delivery?.externalReady!==true||report.pipeline?.singleRc7PushGate!==true||report.assets?.commercialArtworkApproved!==false
  ||report.safety?.productionSettlementEnabled!==false||report.safety?.productionCloudRewards!==false||report.safety?.c12Frozen!==true)
  throw new Error('RC7 integrated report failed');
if(manifest.version!=='c15-rc7-asset-delivery-manifest-v1'||manifest.client?.nativePayloadStore!=='Android app-private files'
  ||manifest.server?.productionDataPlane!=='Google Cloud Storage/CDN configurable'||manifest.validation?.ci!=='gate:c15-rc7')
  throw new Error('RC7 delivery manifest failed');
console.log(`\nC15_RC7_${fast?'FAST_':''}GATE_PASS ${path.join(output,'C15_RC7_GATE_REPORT.json')}`);
