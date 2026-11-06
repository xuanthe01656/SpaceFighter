/**
 * READ-ONLY gameplay parity lab: same C15 deterministic simulator in a local
 * Guest QA lane and the independent server fixture. Tests intentionally do
 * NOT assert that the existing Legacy CampaignScene has been migrated yet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createGuestC15Alpha1QaSnapshot,createGuestC15Alpha1QaBattle,
  advanceGuestC15Alpha1QaBattle,guestC15Alpha1QaView,guestC15QaControlConfig} from '../src/game/c15/GuestC15Alpha1Local.js';
const require=createRequire(import.meta.url);
const {createC15Rc1Fixture,openFixtureRun,generateC15VictoryFrames}=require('../../server/tools/c15Rc1Fixture.cjs');
const {resolveC15ControlProfile}=require('../../server/lib/c15ControlProfilesV1.cjs');
const {replayCombatSliceChunk}=require('../../server/lib/combatVerticalSliceV8.cjs');

async function pair(){
  const f=await createC15Rc1Fixture({seed:11335577,profileId:'arcade-responsive-v2'});
  const local=createGuestC15Alpha1QaBattle({seed:f.snapshot.seed,issuedAtMs:f.issuedAtMs,
    uid:f.uid.startsWith('guest-')?f.uid:'guest-c15-qa',sessionId:f.sessionId,battleId:f.battleId});
  // Server's original fixture UID is not a guest ID; compare the cloned
  // server snapshot using the same local-guest identity, too.
  const serverSnap=createGuestC15Alpha1QaSnapshot({uid:'guest-c15-qa',sessionId:f.sessionId,
    battleId:f.battleId,issuedAtMs:f.issuedAtMs,seed:f.snapshot.seed});
  return {f,local,serverSnap};
}
test('guest local QA snapshot uses exactly the same equipment/catalog hashes as server',async()=>{
  const {f,local}=await pair();
  assert.deepEqual(local.snapshot.equipment,f.snapshot.equipment);
  assert.equal(local.snapshot.selectedCatalogHash,f.snapshot.selectedCatalogHash);
  assert.equal(local.snapshot.loadoutHash,f.snapshot.loadoutHash);
  assert.equal(local.encounter.waves.length,5);
  assert.deepEqual(local.encounter.waves.map(w=>w.enemies.length),[8,11,14,17,20]);
  assert.equal(local.encounter.waves.reduce((n,w)=>n+w.enemies.length,0),70);
  assert.equal(local.policy.version,resolveC15ControlProfile('arcade-responsive-v2').policyVersion);
});
test('local guest and server execute identical tick-level combat for same canonical input',async()=>{
  const {f,local:opened}=await pair();
  // Hashes differ by actor/battle context; simulation is identical under
  // equal seed, equipment, arena and input, including enemy and projectiles.
  let guest=opened,server=openFixtureRun(f);
  for(let i=0;i<100;i++){
    const input={x:i%17===0?0:i%11<5?127:i%11>6?-127:0,z:i%19===0?-127:0};
    if(input.x*input.x+input.z*input.z>128*128)input.z=0;
    guest=advanceGuestC15Alpha1QaBattle(guest,input);
    server=replayCombatSliceChunk({run:server,chunk:{protocol:'pve-input-v1',battleId:f.battleId,
      startTick:server.state.tick,frames:[input]},receivedAtMs:f.issuedAtMs+Math.ceil((server.state.tick+1)*1000/30)+10}).run;
    const g=guest.run.state,s=server.state;
    for(const key of ['tick','hp','kills','contacts','spawnedWaves','phase','escaped'])assert.equal(g[key],s[key],`${key} tick=${i+1}`);
    assert.deepEqual(g.enemies,s.enemies,`enemies at tick ${i+1}`);
    assert.deepEqual(g.projectiles,s.projectiles,`player projectiles at tick ${i+1}`);
    assert.deepEqual(g.enemyProjectiles,s.enemyProjectiles,`hostile projectiles at tick ${i+1}`);
    assert.deepEqual(guest.run.foundation.checkpoint.position,server.foundation.checkpoint.position,
      `pilot position tick ${i+1}`);
  }
  const view=guestC15Alpha1QaView(guest);
  assert.equal(view.safeForSettlement,false);
  assert.equal(view.cloudRewards,false);
  assert.equal(view.serverReplayRequired,false);
  assert.equal(guestC15QaControlConfig(guest,{canvasWidth:393,canvasHeight:852}).movePerTick,guest.run.foundation.preview.movePerTickUnits);
});
test('guest QA runner has no online authority and rejects out-of-contract inputs',async()=>{
  const {local}=await pair();
  assert.equal(local.qaOnly,true);
  assert.equal(local.safeForSettlement,false);
  assert.equal(local.nonEconomic,true);
  assert.equal(local.serverReplayRequired,false);
  assert.throws(()=>advanceGuestC15Alpha1QaBattle(local,{x:300,z:0}),/Invalid guest QA input/);
  assert.throws(()=>advanceGuestC15Alpha1QaBattle(local,{x:127,z:127}),/Invalid guest QA input/);
  assert.throws(()=>createGuestC15Alpha1QaSnapshot({seed:0}),/Invalid local-only/);
});

test('entire five-wave 70-kill replay uses the identical simulation when Guest QA receives same inputs',async()=>{
  const {f,local:opened}=await pair();
  const oracle=generateC15VictoryFrames(f);
  let guest=opened;
  for(const input of oracle.frames)guest=advanceGuestC15Alpha1QaBattle(guest,input);
  const view=guestC15Alpha1QaView(guest);
  assert.equal(view.phase,'lab-clear');
  assert.equal(view.wave,5);
  assert.equal(view.kills,70);
  assert.equal(view.tick,oracle.run.state.tick);
  assert.equal(view.hp,oracle.run.state.hp);
  assert.deepEqual(view.enemies,[]);
  assert.equal(view.serverReplayRequired,false);
  assert.equal(view.safeForSettlement,false);
});

test('guest QA module does not include any network, rewards, credentials or settlement APIs',()=>{
  const text=readFileSync(new URL('../src/game/c15/GuestC15Alpha1Local.js',import.meta.url),'utf8');
  const component=readFileSync(new URL('../src/components/Campaign/GuestC15Alpha1QA.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(text,/(?:fetch\s*\(|axios\.|gameApi\.|firebase\.|firestore\.|claimReward\s*\(|localStorage\.|HMAC_KEY|createServerBattleSnapshot)/iu);
  assert.doesNotMatch(component,/(?:fetch\s*\(|axios\.|gameApi\.|firestore\.|claimReward\s*\(|localStorage\.|HMAC_KEY)/iu);
  const route=readFileSync(new URL('../src/components/Campaign/CampaignEngine.jsx',import.meta.url),'utf8');
  assert.match(route,/import\.meta\.env\.DEV===true/);
  assert.match(route,/VITE_GUEST_C15_ALPHA1_PARITY_QA/);
});
