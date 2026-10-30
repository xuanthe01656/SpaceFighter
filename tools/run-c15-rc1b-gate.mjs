import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const npmCli=String(process.env.npm_execpath||'').trim();
const stripAnsi=value=>String(value||'').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,'');
function commandForNpm(args){
  if(npmCli)return {command:process.execPath,args:[npmCli,...args]};
  if(process.platform==='win32'){
    const comspec=process.env.ComSpec||process.env.COMSPEC||'cmd.exe';
    return {command:comspec,args:['/d','/s','/c',['npm.cmd',...args].join(' ')]};
  }
  return {command:'npm',args};
}
function run(label,command,args,cwd=root,{capture=false}={}){
  console.log(`\n=== ${label} ===`);
  const options={cwd,env:process.env,maxBuffer:64*1024*1024};
  if(capture){options.encoding='utf8';options.stdio=['inherit','pipe','pipe'];}
  else options.stdio='inherit';
  const out=spawnSync(command,args,options);
  if(capture){if(out.stdout)process.stdout.write(out.stdout);if(out.stderr)process.stderr.write(out.stderr);}
  if(out.error)throw out.error;
  if(out.status!==0)throw new Error(`${label} failed with exit ${out.status}`);
  return capture?`${out.stdout||''}\n${out.stderr||''}`:'';
}
function runNpm(label,args,cwd,options){const cmd=commandForNpm(args);return run(label,cmd.command,cmd.args,cwd,options);}
function requireZeroSkipTest(label,cwd){
  const output=stripAnsi(runNpm(label,['test'],cwd,{capture:true}));
  const failMatches=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*fail\s+(\d+)/g)];
  const skipMatches=[...output.matchAll(/(?:^|\n)\s*(?:#|ℹ)\s*skipped\s+(\d+)/g)];
  if(failMatches.length===0||skipMatches.length===0)throw new Error(`${label} TAP summary missing; fail closed`);
  const failed=Number(failMatches.at(-1)[1]),skipped=Number(skipMatches.at(-1)[1]);
  if(failed!==0||skipped!==0)throw new Error(`${label} requires 0 FAIL / 0 SKIP; got fail=${failed}, skip=${skipped}`);
}
const evidenceOnly=process.argv.includes('--evidence-only');
run('C15 BROWSER KERNEL SOURCE CHECK',process.execPath,
  [path.join(root,'client/scripts/generate-c15-browser-kernel.mjs'),'--check']);
if(!evidenceOnly){
  requireZeroSkipTest('CLIENT TEST',path.join(root,'client'));
  requireZeroSkipTest('SERVER TEST',path.join(root,'server'));
  runNpm('CLIENT PRODUCTION BUILD',['run','build'],path.join(root,'client'));
}
const output=path.join(root,'client','dist','c15-rc1b');
run('C15 RC1B INTEGRATED EVIDENCE',process.execPath,
  [path.join(root,'server/tools/generateC15Rc1bEvidence.cjs'),'--output-dir',output]);
const reportPath=path.join(output,'C15_RC1B_GATE_REPORT.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.status!=='PASS'||report.localRuntime?.networkCriticalPath!==false
  ||report.localRuntime?.victory?.stateDigest!==report.localRuntime?.victory?.serverStateDigest
  ||report.localRuntime?.defeat?.stateDigest!==report.localRuntime?.defeat?.serverStateDigest
  ||report.serverReplay?.victory?.phase!=='rc1-verified-clear'||report.serverReplay?.victory?.waves!==5
  ||report.serverReplay?.victory?.kills!==70||report.serverReplay?.defeat?.phase!=='rc1-verified-defeat'
  ||report.serverReplay?.defeat?.hp!==0||report.journalCapacity?.ticks!==4500
  ||report.journalCapacity?.chunks<151||report.backgroundTransport?.gameplayWaitedForNetwork!==false
  ||report.resources?.atomicActivation!==true||report.resources?.rollbackRecorded!==true
  ||report.safety?.c12Frozen!==true||report.safety?.safeForSettlement!==false
  ||report.safety?.settlementEnabled!==false||report.safety?.cloudRewards!==false){
  throw new Error('C15 RC1B report failed integrated safety gate');
}
console.log(`\nC15_RC1B_GATE_PASS ${reportPath}`);
