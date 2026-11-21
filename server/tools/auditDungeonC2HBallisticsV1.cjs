#!/usr/bin/env node
'use strict';
/** Offline, read-only C2H projectile QA. Never claims combat parity or rewards. */
const fs=require('node:fs');
const {auditDungeonC2HBallisticReplayV1}=require('../lib/c15DungeonC2HBallisticReplayV1.cjs');
async function main(){
  const file=process.argv[2];
  if(!file||process.argv.length!==3)throw new TypeError('C2H_USAGE: node server/tools/auditDungeonC2HBallisticsV1.cjs FILE.json');
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>256*1024)
    throw new TypeError('C2H_QA_JSON_SIZE_OR_TYPE');
  const body=JSON.parse(fs.readFileSync(file,'utf8'));
  const report=await auditDungeonC2HBallisticReplayV1(body);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.ballisticSubsetPass)process.exitCode=2;
}
main().catch(e=>{console.error(`C2H_OFFLINE_AUDIT_FAIL=${e.code||e.message}`);process.exitCode=1;});
