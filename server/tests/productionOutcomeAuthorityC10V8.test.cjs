'use strict';
/** C10 integration contract: all proof issuance/settlement is DISCONNECTED. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VERSION,REPLAY_VERSION,SOURCE,STAGE_ENEMIES,
  createProductionOutcomeAuthorityC10,createC10SettlementBridge}
  =require('../lib/productionOutcomeAuthorityC10V8.cjs');
const T0=Date.parse('2026-10-27T04:00:00Z');
const UID='c10_closed_internal_user';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const OTHER_SID='b2f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const OTHER_BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a2';
const KEY=Buffer.alloc(32,0x5e);
const KEY_ID='c10_prod_key_01';
const PATH=`users/${UID}`;
const PROOF=`${PATH}/productionBattleOutcomes/${BID}`;
const LEDGER=`${PATH}/verifiedBattleSettlements/${BID}`;
const REQ='c10_prod_settle_000001';
const opPath=`${PATH}/operations/${REQ}`;
const gates=()=>({nativeTouchParity:true,productionEncounter:true,
  firestoreRulesIam:true,productionReplay:true});
const failCode=code=>e=>e?.code===code;
const clone=x=>structuredClone(x);
class Ref {
  constructor(db,p){this.db=db;this.path=p;}
  doc(id){return new Ref(this.db,`${this.path}/${id}`);}
  collection(id){return new Ref(this.db,`${this.path}/${id}`);}
  async get(){this.db.reads++;const data=this.db.data.get(this.path);
    return {exists:data!==undefined,data:()=>clone(data)};}
}
class FakeDb {
  constructor(){this.data=new Map();this.writes=[];this.reads=0;
    this.tail=Promise.resolve();this.failCommit=false;}
  collection(id){return new Ref(this,id);}
  runTransaction(fn){
    const job=async()=>{
      const updates=[];let wrote=false;
      const t={get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');return ref.get();},
        create:(ref,value)=>{wrote=true;updates.push({op:'create',path:ref.path,data:clone(value)});},
        set:(ref,value)=>{wrote=true;updates.push({op:'set',path:ref.path,data:clone(value)});}};
      const output=await fn(t);
      if(this.failCommit)throw Error('INJECTED_COMMIT_FAILURE');
      if(updates.some(x=>x.op==='create'&&this.data.has(x.path)))
        throw Error('CREATE_CONFLICT');
      for(const u of updates){this.data.set(u.path,u.data);this.writes.push({op:u.op,path:u.path});}
      return output;
    };
    const promise=this.tail.then(job,job);this.tail=promise.catch(()=>{});return promise;
  }
}
let catalog,schema;
test.before(async()=>{
  [catalog,schema]=await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href)]);
});
const report=(changes={})=>({version:REPLAY_VERSION,source:SOURCE,
  uid:UID,sessionId:SID,battleId:BID,mode:'campaign',planetId:1,stage:1,
  locationId:'alpha_stage_1',rulesVersion:'combat-v1.0.0',
  catalogVersion:'product-v1.0.0',phase:'verified-clear',
  verifiedAtMs:T0,verifiedTicks:3018,snapshotHash:'a'.repeat(64),
  inputDigest:'b'.repeat(64),enemiesExpected:STAGE_ENEMIES,
  enemiesKilled:70,enemiesEscaped:0,enemyContacts:0,finalHp:24,
  serverOriginAuthenticated:true,independentReplayMatched:true,
  clientVictoryIgnored:true,qaOnly:false,nonEconomic:false,...changes});
function fixture(overrides={}){
  const db=new FakeDb();let now=T0+1000,replayCount=0;
  const profile=schema.createProfileDocument({coins:100,diamonds:10,energy:42,
    campaignData:schema.createDefaultCampaignData()},
    {displayName:'C10 internal test',photoURL:''},T0);
  profile.sessionId=SID;
  profile.security={battleDay:'2026-10-27',battleCoins:0,battleWins:0,
    battleDiamonds:0,battleStarts:1};
  db.data.set(PATH,profile);
  const replay=async()=>{replayCount++;return report(overrides.reportChanges);};
  const authority=(opts={})=>createProductionOutcomeAuthorityC10({db,
    enabled:true,allowedUids:[UID],signingKeyId:KEY_ID,signingKey:KEY,
    verificationKeys:new Map([[KEY_ID,KEY]]),
    trustedProductionReplay:replay,reviewGates:gates(),now:()=>now,...opts});
  const bridge=(svc,opts={})=>createC10SettlementBridge({db,authority:svc,
    enabled:true,allowedUids:[UID],catalogModule:catalog,schemaModule:schema,
    now:()=>now,...opts});
  return {db,authority,bridge,replay,clock:x=>{if(x!==undefined)now=x;return now;},
    replayCount:()=>replayCount};
}
test('C10 default disabled before any DB reads, regardless of passed identity',async()=>{
  const disabled=createProductionOutcomeAuthorityC10();
  assert.equal(disabled.enabled,false);
  await assert.rejects(async()=>disabled.issue(UID,SID,BID),failCode('C10_AUTHORITY_DISABLED'));
  await assert.rejects(async()=>disabled.readForSettlement({}),failCode('C10_AUTHORITY_DISABLED'));
  const f=fixture();const closed=createProductionOutcomeAuthorityC10({db:f.db});
  await assert.rejects(async()=>closed.issue(UID,SID,BID),failCode('C10_AUTHORITY_DISABLED'));
  assert.equal(f.db.reads,0);assert.equal(f.db.writes.length,0);
});
test('C10 cannot enable without all four external gates and trusted replay',()=>{
  const f=fixture();
  const baseline={db:f.db,enabled:true,allowedUids:[UID],
    signingKeyId:KEY_ID,signingKey:KEY,verificationKeys:new Map([[KEY_ID,KEY]]),
    trustedProductionReplay:f.replay,reviewGates:gates()};
  for(const extra of [
    {reviewGates:{}},{reviewGates:{...gates(),nativeTouchParity:false}},
    {reviewGates:{...gates(),firestoreRulesIam:false}},
    {reviewGates:{...gates(),productionReplay:false}},
    {trustedProductionReplay:null},{signingKey:Buffer.alloc(8)},
    {verificationKeys:new Map()},{signingKeyId:'bad/key'},
    {allowedUids:[]},{allowedUids:['../bad']},
    {allowedUids:[UID,UID]}
  ])assert.throws(()=>createProductionOutcomeAuthorityC10({...baseline,...extra}),/requires/);
});
test('C10 70-kill production report signs create-only isolated outcome; no economy writes',async()=>{
  const f=fixture(),a=f.authority();const before=clone(f.db.data.get(PATH));
  const result=await a.issue(UID,SID,BID);
  assert.equal(result.duplicate,false);assert.equal(result.phase,'verified-clear');
  assert.match(result.receiptDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(f.db.writes.map(x=>x.path),[PROOF]);
  assert.deepEqual(f.db.data.get(PATH),before);
  const proof=f.db.data.get(PROOF);
  assert.equal(proof.version,VERSION);assert.equal(proof.grant.settlementEnabled,true);
  assert.equal(proof.grant.productionReceiptDigest,result.receiptDigest);
  assert.ok(!JSON.stringify(proof).includes(KEY.toString('hex')));
  assert.ok(!JSON.stringify(proof).includes(KEY.toString('base64')));
});
test('C10 duplicate issuance and 10 concurrent issuances create only one proof',async()=>{
  const f=fixture(),a=f.authority();
  const values=await Promise.all(Array.from({length:10},()=>a.issue(UID,SID,BID)));
  assert.equal(values.filter(x=>!x.duplicate).length,1);
  assert.equal(new Set(values.map(x=>x.receiptDigest)).size,1);
  assert.equal(f.db.writes.length,1);assert.equal(f.replayCount(),1);
});
test('C10 settlement bridge requires enabled authenticated authority and stays OFF by default',async()=>{
  const f=fixture(),a=f.authority();
  assert.throws(()=>f.bridge(null),/requires enabled/);
  const closed=createC10SettlementBridge({db:f.db});
  await assert.rejects(closed.settle(UID,SID,{battleId:BID,requestId:REQ}),
    failCode('VERIFIED_SETTLEMENT_DISABLED'));
  assert.equal(f.db.writes.length,0);
  const enabled=f.bridge(a);
  await assert.rejects(enabled.settle(UID,SID,{battleId:BID,requestId:REQ}),
    failCode('C10_RECEIPT_MISSING'));
  assert.equal(f.db.writes.length,0);
});
test('C10 signed outcome + C7-B2B transaction: exactly 450 coins/100 XP/1 star once',async()=>{
  const f=fixture(),a=f.authority(),b=f.bridge(a);
  await a.issue(UID,SID,BID);
  const one=await b.settle(UID,SID,{battleId:BID,requestId:REQ});
  assert.deepEqual({duplicate:one.duplicate,coins:one.coins,
    experience:one.experience,stars:one.stars},
    {duplicate:false,coins:450,experience:100,stars:1});
  const retry=await b.settle(UID,SID,{battleId:BID,requestId:REQ});
  assert.equal(retry.duplicate,true);assert.equal(retry.ledgerDigest,one.ledgerDigest);
  const user=f.db.data.get(PATH);
  assert.equal(user.wallet.coins,550);assert.equal(user.progress.exp,100);
  assert.equal(user.progress.planets[1].stars[1],1);
  assert.deepEqual(f.db.writes.map(x=>x.path),[PROOF,PATH,LEDGER,opPath]);
});
test('C10 10 parallel settlements from one signed receipt grant exactly once',async()=>{
  const f=fixture(),a=f.authority(),b=f.bridge(a);
  await a.issue(UID,SID,BID);
  const results=await Promise.all(Array.from({length:10},()=>b.settle(UID,SID,
    {battleId:BID,requestId:REQ})));
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  assert.equal(f.db.data.get(PATH).wallet.coins,550);
  assert.equal(f.db.writes.length,4);
});
test('C10 server-verified defeat settles with zero payout but one play mission',async()=>{
  const f=fixture({reportChanges:{phase:'verified-defeat',enemiesKilled:4,
    finalHp:0}}),a=f.authority(),b=f.bridge(a);
  const issued=await a.issue(UID,SID,BID);
  assert.equal(issued.phase,'verified-defeat');
  const result=await b.settle(UID,SID,{battleId:BID,requestId:REQ});
  assert.equal(result.coins,0);assert.equal(result.experience,0);assert.equal(result.stars,0);
  assert.equal(f.db.data.get(PATH).wallet.coins,100);
});
test('C10 rejects QA lab-clear, replay markers, and client-declared wins',async()=>{
  for(const change of [{phase:'lab-clear'},{qaOnly:true},
    {source:'qaBattleAuditProofs'},{clientVictoryIgnored:false},
    {serverOriginAuthenticated:false},{independentReplayMatched:false},
    {nonEconomic:true},{version:'v8-c7b2a-genesis-replay-audit-v1'},
    {victory:true},{coins:999999}]){
    const f=fixture({reportChanges:change});
    await assert.rejects(f.authority().issue(UID,SID,BID),
      failCode('C10_PRODUCTION_REPLAY_REQUIRED'));
    assert.equal(f.db.writes.length,0);
  }
});
test('C10 rejects contacts and escaped enemies even when 70/70 resolved',async()=>{
  for(const change of [
    {enemiesKilled:69,enemyContacts:1},
    {enemiesKilled:69,enemiesEscaped:1},
    {enemiesKilled:68,enemyContacts:1,enemiesEscaped:1},
    {enemiesKilled:70,enemyContacts:1},
    {enemiesKilled:70,finalHp:0}]){
    const f=fixture({reportChanges:change});
    await assert.rejects(f.authority().issue(UID,SID,BID),
      e=>['C10_UNSAFE_CLEAR','C10_PRODUCTION_REPLAY_REQUIRED'].includes(e?.code));
    assert.equal(f.db.writes.length,0);
  }
});
test('C10 denies impossible defeat, more than 4500 ticks, wrong rules/stage/UID',async()=>{
  for(const change of [{phase:'verified-defeat',finalHp:20},
    {verifiedTicks:4501},{mode:'dungeon'},{planetId:2},
    {locationId:'alpha_stage_2'},{rulesVersion:'unreviewed'},
    {catalogVersion:'unreviewed'},{uid:'attacker'},{sessionId:OTHER_SID},
    {battleId:OTHER_BID},{enemiesExpected:71},{snapshotHash:'ZZ'},
    {verifiedAtMs:T0+5000}]){
    const f=fixture({reportChanges:change});
    await assert.rejects(f.authority().issue(UID,SID,BID),
      e=>['C10_DEFEAT_INVALID','C10_PRODUCTION_REPLAY_REQUIRED'].includes(e?.code));
    assert.equal(f.db.writes.length,0);
  }
});
test('C10 MAC blocks edited signed proof even when a plain SHA is recomputed',async()=>{
  const f=fixture(),a=f.authority();await a.issue(UID,SID,BID);
  const bad=clone(f.db.data.get(PROOF));bad.report.enemiesKilled=69;
  f.db.data.set(PROOF,bad);
  await assert.rejects(a.readForSettlement({transaction:{get:r=>r.get()},
    uid:UID,sessionId:SID,battleId:BID}),failCode('C10_RECEIPT_MAC'));
  assert.equal(f.db.writes.length,1);
});
test('C10 MAC blocks changes to economic grant flags, receipt digests, or phases',async()=>{
  for(const edit of [p=>p.grant.settlementEnabled=false,
    p=>p.grant.phase='verified-defeat',p=>p.grant.productionReceiptDigest='c'.repeat(64),
    p=>{p.mac='a'.repeat(64);}]){
    const f=fixture(),a=f.authority();await a.issue(UID,SID,BID);
    const forged=clone(f.db.data.get(PROOF));edit(forged);f.db.data.set(PROOF,forged);
    await assert.rejects(a.readForSettlement({transaction:{get:r=>r.get()},
      uid:UID,sessionId:SID,battleId:BID}),failCode('C10_RECEIPT_MAC'));
  }
});
test('C10 actor context and rotated session cannot borrow another user proof',async()=>{
  const f=fixture(),a=f.authority();
  await assert.rejects(a.issue('outside_allowlist',SID,BID),failCode('C10_NOT_ALLOWED'));
  await assert.rejects(a.issue(UID,'not-a-session',BID),failCode('C10_ACTOR_INVALID'));
  await a.issue(UID,SID,BID);
  await assert.rejects(a.readForSettlement({transaction:{get:r=>r.get()},
    uid:UID,sessionId:OTHER_SID,battleId:BID}),
    failCode('C10_RECEIPT_INVALID'));
  await assert.rejects(a.readForSettlement({transaction:{get:r=>r.get()},
    uid:UID,sessionId:SID,battleId:OTHER_BID}),
    failCode('C10_RECEIPT_MISSING'));
  const changed=clone(f.db.data.get(PATH));changed.sessionId=OTHER_SID;
  f.db.data.set(PATH,changed);
  await assert.rejects(a.issue(UID,SID,OTHER_BID),failCode('SESSION_EXPIRED'));
});
test('C10 deletion pending and account tombstone block origin issuance',async()=>{
  const f=fixture(),a=f.authority();
  f.db.data.set(`accountDeletionJobs/${UID}`,{state:'pending'});
  await assert.rejects(a.issue(UID,SID,BID),failCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);
  const user=clone(f.db.data.get(PATH));user.accountDeletion={status:'pending'};
  f.db.data.set(PATH,user);
  await assert.rejects(a.issue(UID,SID,BID),failCode('ACCOUNT_DELETION_PENDING'));
  assert.equal(f.db.writes.length,0);
});
test('C10 atomic rollback: issuance failure cannot leave partial proof',async()=>{
  const f=fixture(),a=f.authority();f.db.failCommit=true;
  await assert.rejects(a.issue(UID,SID,BID),/INJECTED_COMMIT_FAILURE/);
  assert.equal(f.db.data.has(PROOF),false);assert.equal(f.db.writes.length,0);
});
test('C10 atomic rollback: settlement failure cannot change wallet or ledger',async()=>{
  const f=fixture(),a=f.authority(),b=f.bridge(a);
  await a.issue(UID,SID,BID);
  const before=clone(f.db.data.get(PATH));
  f.db.failCommit=true;
  await assert.rejects(b.settle(UID,SID,{battleId:BID,requestId:REQ}),
    /INJECTED_COMMIT_FAILURE/);
  assert.deepEqual(f.db.data.get(PATH),before);
  assert.equal(f.db.data.has(LEDGER),false);
});
test('C10 production source currently unconnected to HTTP, startup and QA proof paths',()=>{
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  const game=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  const authority=fs.readFileSync(path.resolve(__dirname,'../lib/productionOutcomeAuthorityC10V8.cjs'),'utf8');
  assert.doesNotMatch(server,/productionOutcomeAuthorityC10|\/api\/v1\/battle\/settle/);
  assert.doesNotMatch(game,/productionOutcomeAuthorityC10|createC10SettlementBridge/);
  assert.doesNotMatch(authority,/\.collection\(['"]qaBattle|require\(['"]\.\/qaBattle/);
  assert.match(game,/BATTLE_VERIFICATION_UNAVAILABLE/);
});
test('C10 Firestore client cannot write production outcomes/settlement (static rules)',()=>{
  const rules=fs.readFileSync(path.resolve(__dirname,'../../security/firestore.rules'),'utf8');
  assert.match(rules,/match \/users\/\{uid\}/);
  assert.match(rules,/match \/\{child=\*\*\} \{ allow read, write: if false; \}/);
  // A static source check cannot prove deployed Rules or Admin SDK IAM.
});
