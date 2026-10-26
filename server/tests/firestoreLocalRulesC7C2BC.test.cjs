'use strict';
/** These are static config guards, NOT proof of deployed Firestore IAM/Rules. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.c7c2.qa.json'),'utf8'));
const rules=fs.readFileSync(path.join(root,'security/firestore.rules'),'utf8');
const emulator=fs.readFileSync(path.join(root,'server/tools/firestoreRulesEmulatorC7C2.cjs'),'utf8');

test('C7-C2BC emulator config uses checked-in Firestore rules and no production project ID',()=>{
  assert.equal(config.firestore.rules,'security/firestore.rules');
  assert.equal(config.projectId,undefined);
  assert.equal(config.emulators.singleProjectMode,true);
  assert.equal(config.emulators.ui.enabled,false);
});
test('C7-C2BC emulators must bind only IPv4 loopback with fixed ports',()=>{
  for(const name of ['auth','firestore']){
    assert.equal(config.emulators[name].host,'127.0.0.1');
    assert.equal(Number.isInteger(config.emulators[name].port),true);
    assert.equal(config.emulators[name].port>=1024,true);
  }
  assert.notEqual(config.emulators.auth.port,config.emulators.firestore.port);
});
test('C7-C2BC rules explicitly deny client player writes and all nested reads',()=>{
  assert.match(rules,/match\s+\/users\/\{uid\}/);
  assert.match(rules,/allow list, create, update, delete:\s*if false;/);
  assert.match(rules,/match\s+\/\{child=\*\*\}\s*\{\s*allow read, write:\s*if false;/);
  assert.match(rules,/match\s+\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;/);
});
test('C7-C2BC emulator driver rejects non-demo projects and non-loopback hosts',()=>{
  assert.match(emulator,/demo-spacefighter-/);
  assert.match(emulator,/127\\\.0\\\.0\\\.1/);
  assert.match(emulator,/FIREBASE_AUTH_EMULATOR_HOST/);
  assert.match(emulator,/FIRESTORE_EMULATOR_HOST/);
  assert.doesNotMatch(emulator,/firebase deploy/);
});
test('C7-C2BC local QA config never enables deployed Cloud Battle or settlement',()=>{
  const serialized=JSON.stringify(config);
  assert.doesNotMatch(serialized,/GAME_BATTLE_QA_ENABLED|SETTLEMENT|reward|apiKey|privateKey/);
});
