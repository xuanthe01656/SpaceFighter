import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const npmCli=String(process.env.npm_execpath||'').trim();
const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,'');
function commandForNpm(args){if(npmCli)return {command:process.execPath,args:[npmCli,...args]};
  if(process.platform==='win32'){const comspec=process.env.ComSpec||process.env.COMSPEC||'cmd.exe';return {command:comspec,args:['/d','/s','/c',['npm.cmd',...args].join(' ')]};}
  return {command:'npm',args};}
function run(label,command,args,cwd=root,{capture=false}={}){console.log(`\n=== ${label} ===`);const options={cwd,env:process.env,maxBuffer:128*1024*1024};
  if(capture){options.encoding='utf8';options.stdio=['inherit','pipe','pipe'];}else options.stdio='inherit';
  const out=spawnSync(command,args,options);if(capture){if(out.stdout)process.stdout.write(out.stdout);if(out.stderr)process.stderr.write(out.stderr);}
  if(out.error)throw out.error;if(out.status!==0)throw new Error(`${label} failed with exit ${out.status}`);return capture?`${out.stdout||''}\n${out.stderr||''}`:'';}
function runNpm(label,args,cwd,options){const cmd=commandForNpm(args);return run(label,cmd.command,cmd.args,cwd,options);}
function requireZeroSkipTest(label,cwd){const output=stripAnsi(runNpm(label,['test'],cwd,{capture:true}));
  const fail=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*fail\s+(\d+)/g)],skip=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*skipped\s+(\d+)/g)];
  if(!fail.length||!skip.length)throw new Error(`${label} TAP summary missing; fail closed`);
  const failed=Number(fail.at(-1)[1]),skipped=Number(skip.at(-1)[1]);if(failed!==0||skipped!==0)
    throw new Error(`${label} requires 0 FAIL / 0 SKIP; got fail=${failed}, skip=${skipped}`);}
const evidenceOnly=process.argv.includes('--evidence-only');
run('C15 BROWSER KERNEL SOURCE CHECK',process.execPath,[path.join(root,'client/scripts/generate-c15-browser-kernel.mjs'),'--check']);
if(!evidenceOnly){requireZeroSkipTest('CLIENT TEST',path.join(root,'client'));requireZeroSkipTest('SERVER TEST',path.join(root,'server'));
  runNpm('CLIENT PRODUCTION BUILD',['run','build'],path.join(root,'client'));}
const output=path.join(root,'client','dist','c15-rc3'),upstream=path.join(output,'upstream-rc1c-rc2');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(upstream,{recursive:true});
run('C15 RC1C + RC2 UPSTREAM EVIDENCE',process.execPath,[path.join(root,'server/tools/generateC15Rc1cRc2Evidence.cjs'),'--output-dir',upstream]);
const upstreamReport=JSON.parse(fs.readFileSync(path.join(upstream,'C15_RC1C_RC2_GATE_REPORT.json'),'utf8'));
if(upstreamReport.status!=='PASS'||upstreamReport.selectedControlProfile!=='arcade-responsive-v1'
  ||upstreamReport.control?.arcadeFaster!==true||upstreamReport.control?.oneTickResponse!==true||upstreamReport.control?.noTeleport!==true
  ||upstreamReport.replay?.bothProfilesParity!==true||upstreamReport.trustedOutcome?.signatureVerified!==true
  ||upstreamReport.trustedOutcome?.tamperRejected!==true||upstreamReport.safety?.settlementEnabled!==false
  ||upstreamReport.safety?.cloudRewards!==false||upstreamReport.safety?.c12Frozen!==true)
  throw new Error('RC1C/RC2 upstream safety gate failed');
run('C15 RC3 SETTLEMENT EVIDENCE',process.execPath,[path.join(root,'server/tools/generateC15Rc3Evidence.cjs'),'--output-dir',output]);
const reportPath=path.join(output,'C15_RC3_GATE_REPORT.json'),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.status!=='PASS'||report.baselineTag!=='c15-rc1c-control-rc2-outcome-pass'
  ||report.selectedControlProfile!=='arcade-responsive-v1'||report.rewardPolicyVersion!=='c15-alpha1-reward-policy-v1'
  ||report.clear?.outcomePhase!=='rc2-trusted-clear'||report.clear?.coins!==450||report.clear?.experience!==100||report.clear?.stars!==1
  ||report.clear?.walletAfter-report.clear?.walletBefore!==450||report.clear?.playMission!==1||report.clear?.clearMission!==1
  ||report.clear?.receiptSignatureVerified!==true||report.defeat?.outcomePhase!=='rc2-trusted-defeat'||report.defeat?.coins!==0
  ||report.defeat?.experience!==0||report.defeat?.stars!==0||report.defeat?.playMission!==1||report.defeat?.clearMission!==0
  ||report.idempotency?.sameRequestDuplicate!==true||report.idempotency?.newRequestSameBattleDuplicate!==true
  ||report.idempotency?.concurrentClaims!==10||report.idempotency?.concurrentFirstWrites!==1||report.idempotency?.concurrentWalletCoins!==550
  ||report.security?.tamperRejected!==true||report.security?.operationTamperRejected!==true||report.security?.clientEconomicFieldsRejected!==true
  ||report.security?.transactionRejected!==true||report.security?.rollbackClean!==true||report.security?.directClientWritesDenied!==true
  ||report.security?.routeIsExplicit!==true||report.security?.legacySettleRouteAbsent!==true||report.security?.allowlistRequired!==true
  ||report.security?.receiptHmacSeparate!==true||report.security?.deployedIamAuditRequired!==true
  ||report.safety?.stagingOnly!==true||report.safety?.productionSettlementEnabled!==false
  ||report.safety?.productionCloudRewards!==false||report.safety?.c12Frozen!==true||report.safety?.rc2OutcomeRequired!==true)
  throw new Error('C15 RC3 report failed integrated safety gate');
if(!evidenceOnly&&!/^[0-9a-f]{40}$/.test(report.gitHead||''))throw new Error('C15 RC3 report must bind exact Git commit');
console.log(`\nC15_RC3_GATE_PASS ${reportPath}`);
