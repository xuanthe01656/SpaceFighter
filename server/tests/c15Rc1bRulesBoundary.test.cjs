'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('C15 RC1B journal/origin/result subcollections remain Admin-only under deployed rules source',()=>{
  const rules=fs.readFileSync(path.resolve(__dirname,'../../security/firestore.rules'),'utf8');
  assert.match(rules,/match \/users\/\{uid\}[\s\S]*allow get: if request\.auth != null && request\.auth\.uid == uid/);
  assert.match(rules,/match \/\{child=\*\*\} \{ allow read, write: if false; \}/);
  for(const collection of ['c15Rc1bSessions','c15Rc1bOrigins','c15Rc1bTrace','c15Rc1bResults']){
    assert.doesNotMatch(rules,new RegExp(`allow\\s+(?:read|write|create|update|delete)[^;]*${collection}`));
  }
});
