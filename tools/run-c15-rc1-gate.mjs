import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const npmCli=String(process.env.npm_execpath||'').trim();

function run(label,command,args,cwd){
  console.log(`\n=== ${label} ===`);
  const out=spawnSync(command,args,{cwd,stdio:'inherit',env:process.env});
  if(out.error)throw out.error;
  if(out.status!==0)throw new Error(`${label} failed with exit ${out.status}`);
}

function runNpm(label,args,cwd){
  if(npmCli){
    run(label,process.execPath,[npmCli,...args],cwd);
    return;
  }
  if(process.platform==='win32'){
    const comspec=process.env.ComSpec||process.env.COMSPEC||'cmd.exe';
    const commandLine=['npm.cmd',...args].join(' ');
    run(label,comspec,['/d','/s','/c',commandLine],cwd);
    return;
  }
  run(label,'npm',args,cwd);
}

const evidenceOnly=process.argv.includes('--evidence-only');
if(!evidenceOnly){
  runNpm('CLIENT TEST',['test'],path.join(root,'client'));
  runNpm('SERVER TEST',['test'],path.join(root,'server'));
  runNpm('CLIENT PRODUCTION BUILD',['run','build'],path.join(root,'client'));
}
const output=path.join(root,'client','dist','c15-rc1');
run('C15 RC1 GOLDEN EVIDENCE',process.execPath,
  [path.join(root,'server','tools','generateC15Rc1Evidence.cjs'),'--output-dir',output],root);
const reportPath=path.join(output,'C15_RC1_GATE_REPORT.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.status!=='PASS'||report.c12Frozen!==true||report.safety?.safeForSettlement!==false){
  throw new Error('C15 RC1 report failed safety gate');
}
console.log(`\nC15_RC1_GATE_PASS ${reportPath}`);
