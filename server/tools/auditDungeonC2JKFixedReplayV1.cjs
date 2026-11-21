#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {auditC2JKFixedReplayV1}=require('../lib/c15DungeonC2JKFixedReplayV1.cjs');
(async()=>{
  if(process.argv.length!==3)throw new Error('Usage: node server/tools/auditDungeonC2JKFixedReplayV1.cjs PATH.json');
  const file=fs.readFileSync(process.argv[2],'utf8');
  if(Buffer.byteLength(file)>262144)throw new Error('C2JK_JSON_EXCEEDS_256K');
  const report=await auditC2JKFixedReplayV1(JSON.parse(file));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
})().catch(error=>{process.stderr.write(`C2JK_OFFLINE_AUDIT_FAIL=${error.code||error.message}\n`);process.exitCode=1;});
