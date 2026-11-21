#!/usr/bin/env node
'use strict';
/** Offline read-only C2C/C2D diagnostic. No UID, ticket, network or rewards. */
const fs=require('node:fs');
const {auditDungeonC2DInputGridV1}=require('../lib/c15DungeonC2DInputAuditV1.cjs');
(async()=>{
  const name=process.argv[2];
  if(!name||process.argv.length!==3)throw new Error('USAGE: node server/tools/auditDungeonC2CInputV1.cjs <C2C_JSON>');
  const size=fs.statSync(name).size;
  if(size<1||size>128*1024)throw new Error('C2C_OFFLINE_JSON_SIZE_INVALID');
  const record=JSON.parse(fs.readFileSync(name,'utf8'));
  const result=await auditDungeonC2DInputGridV1(record);
  console.log(JSON.stringify(result,null,2));
  console.log('TRUE_APK_SERVER_PARITY=NOT_VERIFIED');
  console.log('DUNGEON_REWARDS=LOCKED');
})().catch(error=>{console.error('C2D_OFFLINE_AUDIT_FAIL='+
  (error.code||error.message||'UNKNOWN'));process.exitCode=1;});
