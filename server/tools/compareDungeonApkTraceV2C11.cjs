#!/usr/bin/env node
'use strict';
/** Local comparison ONLY. No remote calls, storage writes, or reward actions.
 * Usage: node server/tools/compareDungeonApkTraceV2C11.cjs trace.json [server_reports.json]
 *  - reports must be an array of separately generated V2C.10 inspect() JSON.
 *  - a matching result remains UNTRUSTED and cannot authorize settlement.
 */
const fs=require('node:fs');
const path=require('node:path');
const {compareDungeonApkTraceV2C11}=require('../lib/c15DungeonApkTraceParityV2C11.cjs');
function parse(file){
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size>4*1024*1024)
    throw new Error('QA JSON must be a regular file under 4 MB');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function main(args){
  if(args.length<1||args.length>2||args.some(x=>x.startsWith('--'))){
    process.stderr.write('Usage: node server/tools/compareDungeonApkTraceV2C11.cjs <apk-trace.json> [v2c10-reports.json]\n');
    return 2;
  }
  try {
    const trace=parse(path.resolve(args[0]));
    const reports=args.length===2?parse(path.resolve(args[1])):[];
    const comparison=compareDungeonApkTraceV2C11({clientTrace:trace,serverReports:reports});
    process.stdout.write(JSON.stringify(comparison,null,2)+'\n');
    // NOT a passing anti-cheat gate: only 0 for structurally valid diagnostics.
    return comparison.status==='CANDIDATE_DIVERGENCE_OBSERVED'?3:0;
  }catch(e){
    process.stderr.write('V2C11_TRACE_QA_REJECTED: '+String(e?.code||e?.message||e)+'\n');
    return 1;
  }
}
if(require.main===module)process.exitCode=main(process.argv.slice(2));
module.exports={main};
