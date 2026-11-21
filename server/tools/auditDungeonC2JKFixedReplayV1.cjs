#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {auditC2JKFixedReplayV1}=require('../lib/c15DungeonC2JKFixedReplayV1.cjs');
(async()=>{
  if(process.argv.length!==3)throw new Error('Usage: node server/tools/auditDungeonC2JKFixedReplayV1.cjs PATH.json');
  const file=fs.readFileSync(process.argv[2],'utf8');
  const byteLength=Buffer.byteLength(file);
  // The C2JP/C2JQ high-rate debug format is allowed 2 MiB by the APK.
  // Keep the 256 KiB legacy limit unchanged. Neither is a network API.
  if(byteLength>2*1024*1024)throw new Error('C2JK_JSON_EXCEEDS_2M');
  const record=JSON.parse(file);
  const highRate=['c15-dungeon-c2jp-input-grid-v1',
    'c15-dungeon-c2jq-room-exit-grid-v1'].includes(record?.grid?.version);
  if(!highRate && byteLength>256*1024)throw new Error('C2JK_JSON_EXCEEDS_256K');
  const report=await auditC2JKFixedReplayV1(record);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
})().catch(error=>{process.stderr.write(`C2JK_OFFLINE_AUDIT_FAIL=${error.code||error.message}\n`);process.exitCode=1;});
