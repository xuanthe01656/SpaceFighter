import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const npmCli=String(process.env.npm_execpath||'').trim();
const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,'');
function commandForNpm(args){if(npmCli)return {command:process.execPath,args:[npmCli,...args]};
  if(process.platform==='win32'){const comspec=process.env.ComSpec||process.env.COMSPEC||'cmd.exe';
    return {command:comspec,args:['/d','/s','/c',['npm.cmd',...args].join(' ')]};}
  return {command:'npm',args};}
function run(label,command,args,cwd=root,{capture=false}={}){console.log(`\n=== ${label} ===`);const options={cwd,env:process.env,maxBuffer:96*1024*1024};
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
const output=path.join(root,'client','dist','c15-rc1c-rc2');
run('C15 RC1C + RC2 INTEGRATED EVIDENCE',process.execPath,
  [path.join(root,'server/tools/generateC15Rc1cRc2Evidence.cjs'),'--output-dir',output]);
const reportPath=path.join(output,'C15_RC1C_RC2_GATE_REPORT.json'),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.status!=='PASS'||report.selectedControlProfile!=='arcade-responsive-v1'
  ||report.control?.arcadeFaster!==true||report.control?.oneTickResponse!==true||report.control?.noTeleport!==true
  ||report.replay?.bothProfilesParity!==true||report.replay?.arcade?.victory?.waves!==5
  ||report.replay?.arcade?.victory?.kills!==70||report.replay?.arcade?.defeat?.hp!==0
  ||report.trustedOutcome?.clearPhase!=='rc2-trusted-clear'||report.trustedOutcome?.defeatPhase!=='rc2-trusted-defeat'
  ||report.trustedOutcome?.signatureVerified!==true||report.trustedOutcome?.deterministicDuplicate!==true
  ||report.trustedOutcome?.tamperRejected!==true||report.journalCapacity?.ticks!==4500
  ||report.journalCapacity?.chunks<151||report.resourcesUnchanged!==true
  ||report.safety?.c12Frozen!==true||report.safety?.safeForSettlement!==false
  ||report.safety?.settlementEnabled!==false||report.safety?.cloudRewards!==false)
  throw new Error('C15 RC1C/RC2 report failed integrated safety gate');
console.log(`\nC15_RC1C_RC2_GATE_PASS ${reportPath}`);
