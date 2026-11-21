#!/usr/bin/env node
'use strict';
/** Read-only offline V2C.14-B JSON audit. Never contacts Firestore or server. */
const fs=require('node:fs');
const path=require('node:path');
const {auditDungeonApkInputBundleV2C14B}=require('../lib/c15DungeonApkInputBundleV2C14B.cjs');
async function main(){
  if(process.argv.length!==3||process.argv[2].startsWith('-'))
    throw new Error('USAGE: node auditDungeonApkInputBundleV2C14B.cjs <local-json-path>');
  const file=path.resolve(process.argv[2]);
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<5||stat.size>4*1024*1024)
    throw new Error('V2C14B_FILE_SIZE_INVALID');
  const object=JSON.parse(fs.readFileSync(file,'utf8'));
  const result=await auditDungeonApkInputBundleV2C14B(object);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(error=>{process.stderr.write(`V2C14B_AUDIT_FAIL=${error.code||error.message}\n`);
  process.exitCode=1;});
