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
  requireZeroSkip('RC4 TARGETED CLIENT TEST',process.execPath,['--test','tests/c15Rc4ReleaseChannel.test.mjs','tests/c15Rc4WorkflowTopology.test.mjs','tests/c15Rc3AndroidGate.test.mjs','tests/c15Rc3SettlementClient.test.mjs','tests/nativeAndroidSocialLoginBridge.test.mjs','tests/androidStableQaSigning.test.mjs'],path.join(root,'client'));
  requireZeroSkip('RC4 TARGETED SERVER TEST',process.execPath,['--test','tests/c15Rc4ReleaseGateV1.test.cjs','tests/c15Rc4ReconciliationV1.test.cjs','tests/accountDeletionV6.test.cjs','tests/c15Rc3SettlementV1.test.cjs'],path.join(root,'server'));
}else{
  const client=stripAnsi(runNpm('FULL CLIENT TEST',['test'],path.join(root,'client'),{capture:true}));
  const server=stripAnsi(runNpm('FULL SERVER TEST',['test'],path.join(root,'server'),{capture:true}));
  for(const [label,output] of [['CLIENT',client],['SERVER',server]]){const fail=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*fail\s+(\d+)/g)],skip=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*skipped\s+(\d+)/g)];
    if(!fail.length||!skip.length||Number(fail.at(-1)[1])!==0||Number(skip.at(-1)[1])!==0)throw new Error(`${label} full suite requires 0 FAIL / 0 SKIP`);}
  runNpm('RELEASE CANDIDATE WEBVIEW BUILD',['run','build'],path.join(root,'client'),{env:{VITE_SF_BUILD_CHANNEL:'release-candidate',VITE_APP_VERSION:'1.2.1',VITE_C15_RC1B_ENABLED:'true',VITE_C15_RC3_ENABLED:'false',VITE_C15_RC4_CANARY_SETTLEMENT_ENABLED:'true',VITE_C15_CONTROL_AB_QA:'false',VITE_C15_CONTROL_PROFILE_ID:'arcade-responsive-v1'}});
}
const output=path.join(root,'client/dist/c15-rc4');fs.mkdirSync(output,{recursive:true});
run('RC4 RELEASE HARDENING EVIDENCE',process.execPath,[path.join(root,'server/tools/generateC15Rc4Evidence.cjs'),'--output-dir',output]);
const report=JSON.parse(fs.readFileSync(path.join(output,'C15_RC4_GATE_REPORT.json'),'utf8'));
const releaseManifest=JSON.parse(fs.readFileSync(path.join(output,'C15_RC4_RELEASE_MANIFEST.json'),'utf8'));
if(releaseManifest.version!=='c15-rc4-release-manifest-v1'||releaseManifest.defaultProductionFlags?.settlementEnabled!==false
  ||releaseManifest.defaultProductionFlags?.cloudRewards!==false||releaseManifest.validation?.ci!=='gate:c15-rc4')throw new Error('RC4 release manifest failed');
if(report.status!=='PASS'||report.pipeline?.rc4ManualAuditOnly!==true||report.pipeline?.rc5SupersedingPushGate!==true
  ||report.pipeline?.frozenGatesManualOnly!==true||report.pipeline?.androidManualOnly!==true
  ||report.releaseGate?.killSwitchBlocked!==true||report.releaseGate?.rawIdentityLogged!==false||report.reconciliation?.mismatchDetected!==true
  ||report.safety?.productionSettlementEnabled!==false||report.safety?.productionCloudRewards!==false||report.safety?.c12Frozen!==true)
  throw new Error('RC4 integrated report failed');
console.log(`\nC15_RC4_${fast?'FAST_':''}GATE_PASS ${path.join(output,'C15_RC4_GATE_REPORT.json')}`);
