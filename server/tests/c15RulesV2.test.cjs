'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const server=require('../lib/c15RulesV2.cjs');
const {createC15Rc1Fixture}=require('../tools/c15Rc1Fixture.cjs');
test('C15 client/server rules documents and normalized descriptors remain identical',async()=>{
  const client=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/config/C15RulesV2.js')).href);
  assert.equal(client.c15CanonicalJson(client.C15_RULES_DOCUMENT),server.c15CanonicalJson(server.C15_RULES_DOCUMENT));
  const fixture=await createC15Rc1Fixture();
  const a=client.normalizeC15CombatDescriptor(fixture.snapshot.equipment,{strictRc1:true});
  const b=server.normalizeC15CombatDescriptor(fixture.snapshot.equipment,{strictRc1:true});
  assert.equal(client.c15CanonicalJson(a),server.c15CanonicalJson(b));
  assert.equal(b.stats.attack,113);assert.equal(b.mainGun.pattern.penetration,3);
});
test('C15 server rules reject unregistered mechanics instead of silently simulating',async()=>{
  const fixture=await createC15Rc1Fixture();
  const forged=structuredClone(fixture.snapshot.equipment);forged.mainGun.firePattern='chain';
  assert.throws(()=>server.normalizeC15CombatDescriptor(forged,{strictRc1:false}),/unsupported/);
});
