#!/usr/bin/env node
'use strict';
/** Offline read-only audit; never calls Firebase, Cloud Run or settlement. */
const fs=require('node:fs');
const {auditDungeonC2ECombatWitnessV1}=require('../lib/c15DungeonC2ECausalAuditV1.cjs');
(async()=>{
  if(process.argv.length!==3)throw new Error('Usage: node server/tools/auditDungeonC2EWitnessV1.cjs path/to/dungeon_taurus_c2e_*.json');
  const stat=fs.statSync(process.argv[2]);
  if(!stat.isFile()||stat.size>256*1024)throw new Error('C2E_QA_FILE_SIZE_INVALID');
  const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const report=await auditDungeonC2ECombatWitnessV1(data);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.causalSubsetPass)process.exitCode=2;
})().catch(error=>{
  console.error(`C2E_OFFLINE_AUDIT_FAIL=${error?.code||error?.message||'UNKNOWN'}`);
  process.exitCode=1;
});
