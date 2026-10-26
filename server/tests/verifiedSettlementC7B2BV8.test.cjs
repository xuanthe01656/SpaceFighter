'use strict';
/** C7-B2B disconnected, default-OFF atomic settlement foundation tests. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createVerifiedSettlementC7B2B,PRODUCTION_OUTCOME_VERSION,
  REWARD_POLICY_VERSION,VERSION}=require('../lib/verifiedSettlementC7B2BV8.cjs');
const T0=Date.parse('2026-10-26T07:00:00Z');
const UID='c7b2b_approved_qa';
const OTHER='other_c7b2b_user';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const OTHER_SID='a223a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const OTHER_BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a2';
const REQUEST='c7b2b_settle_req_0001';
const pfx=`users/${UID}`;
const userPath=pfx;
const ledgerPath=`${pfx}/verifiedBattleSettlements/${BID}`;
const operationPath=`${pfx}/operations/${REQUEST}`;
const one=()=>({battleId:BID,requestId:REQUEST});
const failCode=code=>e=>e?.code===code;

class Ref{
  constructor(db,p){this.db=db;this.path=p;}
  doc(id){return new Ref(this.db,`${this.path}/${id}`);}
  collection(id){return new Ref(this.db,`${this.path}/${id}`);}
  async get(){const x=this.db.data.get(this.path);return {exists:x!==undefined,data:()=>structuredClone(x)};}
}
class FakeDb{
  constructor(){this.data=new Map();this.operations=[];this.tail=Promise.resolve();this.rejectCommit=false;}
  collection(id){return new Ref(this,id);}
  runTransaction(fn){
    const task=async()=>{
      const changes=[];let wrote=false;
      const t={
        get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');return ref.get();},
        create:(ref,value)=>{wrote=true;changes.push({method:'create',path:ref.path,data:structuredClone(value)});},
        set:(ref,value)=>{wrote=true;changes.push({method:'set',path:ref.path,data:structuredClone(value)});}
      };
      const result=await fn(t);
      if(this.rejectCommit)throw Error('COMMIT_INJECTED_FAILURE');
      // Atomic all-or-none, including create conflict; mock serializes requests.
      if(changes.some(x=>x.method==='create'&&this.data.has(x.path)))throw Error('DOC_ALREADY_EXISTS');
      for(const x of changes){this.data.set(x.path,x.data);this.operations.push({method:x.method,path:x.path});}
      return result;
    };
    const p=this.tail.then(task,task);this.tail=p.catch(()=>{});return p;
  }
}
let catalog,schema;
test.before(async()=>{
  [catalog,schema]=await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href)
  ]);
});
const makeGrant=(overrides={})=>({
  version:PRODUCTION_OUTCOME_VERSION,uid:UID,sessionId:SID,battleId:BID,
  mode:'campaign',planetId:1,stage:1,locationId:'alpha_stage_1',
  rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0',
  phase:'verified-clear',verifiedAtMs:T0,verifiedTicks:3018,
  snapshotHash:'a'.repeat(64),inputDigest:'b'.repeat(64),
  productionReceiptDigest:'c'.repeat(64),qaOnly:false,nonEconomic:false,
  safeForCloudBattle:true,settlementEnabled:true,...overrides
});
function fixture(options={}){
  const db=new FakeDb();let clock=T0+1000,calls=0;
  const campaign=schema.createDefaultCampaignData();
  const user=schema.createProfileDocument({coins:100,diamonds:10,energy:42,
    campaignData:campaign},{displayName:'Approved QA',photoURL:''},T0);
  user.sessionId=SID;user.profile.customProperty='keep';
  user.security={battleDay:'2026-10-26',battleCoins:0,battleWins:0,
    battleDiamonds:0,battleStarts:1};
  db.data.set(userPath,user);
  const make=(overrides={})=>createVerifiedSettlementC7B2B({
    db,enabled:overrides.enabled??options.enabled??true,
    allowedUids:overrides.allowedUids??[UID],
    trustedProductionVerifier:overrides.trustedProductionVerifier??(async()=>{
      calls++;return makeGrant(options.grantOverrides);
    }),
    catalogModule:overrides.catalogModule??catalog,
    schemaModule:overrides.schemaModule??schema,now:()=>clock
  });
  return {db,make,clock:n=>{if(n!==undefined)clock=n;return clock;},
    calls:()=>calls};
}

test('C7-B2B default OFF blocks before transaction, without mutations or proof reads',async()=>{
  const f=fixture();const svc=createVerifiedSettlementC7B2B({db:f.db});
  const before=structuredClone(f.db.data.get(userPath));
  await assert.rejects(svc.settle(UID,SID,one()),failCode('VERIFIED_SETTLEMENT_DISABLED'));
  assert.deepEqual(f.db.data.get(userPath),before);assert.equal(f.db.operations.length,0);
});
test('C7-B2B explicit closed UID allowlist and server verifier are mandatory for enabled factory',()=>{
  const f=fixture();
  for(const x of [{allowedUids:[UID]},{trustedProductionVerifier:async()=>makeGrant()},
    {allowedUids:['x/../y'],trustedProductionVerifier:async()=>makeGrant()},
    {allowedUids:[UID],trustedProductionVerifier:async()=>makeGrant()}]){
    assert.throws(()=>createVerifiedSettlementC7B2B({db:f.db,enabled:true,...x}),/required/);
  }
});
test('C7-B2B server catalog computes exactly 450 coins + 100 XP + conservative 1 star',async()=>{
  const f=fixture();const svc=f.make(),before=structuredClone(f.db.data.get(userPath));
  const out=await svc.settle(UID,SID,one());
  assert.deepEqual({duplicate:out.duplicate,coins:out.coins,
    experience:out.experience,stars:out.stars},{duplicate:false,coins:450,experience:100,stars:1});
  assert.equal(f.calls(),1);
  const doc=f.db.data.get(userPath);
  assert.equal(doc.wallet.coins,550);assert.equal(doc.wallet.diamonds,10);
  assert.equal(doc.wallet.energy,42);assert.equal(doc.progress.exp,100);
  assert.equal(doc.progress.planets[1].highestStage,2);
  assert.equal(doc.progress.planets[1].stars[1],1);
  assert.equal(doc.progress.selectedStage,2);
  assert.equal(doc.security.battleCoins,450);assert.equal(doc.security.battleWins,1);
  assert.equal(doc.missions.progress.d_play_3,1);
  assert.equal(doc.missions.progress.m_clear_planet,1);
  assert.equal(doc.profile.customProperty,before.profile.customProperty);
  assert.deepEqual(f.db.operations.map(x=>x.path),[userPath,ledgerPath,operationPath]);
  const led=f.db.data.get(ledgerPath);
  assert.equal(led.version,VERSION);assert.equal(led.rewardPolicyVersion,REWARD_POLICY_VERSION);
  assert.equal(led.productionReceiptDigest,'c'.repeat(64));
  assert.match(led.ledgerDigest,/^[a-f0-9]{64}$/);
});
test('C7-B2B defeat is final once-only, zero credits/stars and one play mission increment',async()=>{
  const f=fixture({grantOverrides:{phase:'verified-defeat'}}),svc=f.make();
  const out=await svc.settle(UID,SID,one());
  assert.equal(out.coins,0);assert.equal(out.experience,0);assert.equal(out.stars,0);
  const doc=f.db.data.get(userPath);
  assert.equal(doc.wallet.coins,100);assert.equal(doc.progress.exp,0);
  assert.equal(doc.missions.progress.d_play_3,1);
  assert.equal(doc.missions.progress.m_clear_planet,0);
  assert.equal(doc.progress.planets?.[1]?.highestStage??1,1);
});
test('C7-B2B same request retry and new request ID on same battle never mint twice',async()=>{
  const f=fixture(),svc=f.make();
  const first=await svc.settle(UID,SID,one());
  const again=await svc.settle(UID,SID,one());
  const newReq=await svc.settle(UID,SID,{battleId:BID,requestId:'c7b2b_retry_req_0002'});
  assert.equal(first.duplicate,false);
  assert.equal(again.duplicate,true);assert.equal(newReq.duplicate,true);
  assert.equal(first.ledgerDigest,newReq.ledgerDigest);
  assert.equal(f.db.data.get(userPath).wallet.coins,550);
  assert.equal(f.db.operations.length,3);assert.equal(f.calls(),1);
});
test('C7-B2B 10 simultaneous settlement requests credit only once',async()=>{
  const f=fixture(),svc=f.make();
  const values=await Promise.all(Array.from({length:10},()=>svc.settle(UID,SID,one())));
  assert.equal(values.filter(x=>x.duplicate===false).length,1);
  assert.equal(f.db.data.get(userPath).wallet.coins,550);
  assert.equal(f.db.operations.length,3);assert.equal(f.calls(),1);
});
test('C7-B2B requestId reuse for another battle is rejected even when original ledger exists',async()=>{
  const f=fixture(),svc=f.make();await svc.settle(UID,SID,one());
  await assert.rejects(svc.settle(UID,SID,{battleId:OTHER_BID,requestId:REQUEST}),
    failCode('REQUEST_REUSED'));
  assert.equal(f.db.data.get(userPath).wallet.coins,550);
});
test('C7-B2B no client-controlled economic fields are accepted',async()=>{
  const f=fixture(),svc=f.make();
  for(const data of [{...one(),victory:true},{...one(),stars:3},
    {...one(),reward:{coins:1000000}},{...one(),qaAuditProof:'z'},
    {battleId:BID},{battleId:'bad',requestId:REQUEST},null])
    await assert.rejects(svc.settle(UID,SID,data),failCode('SETTLEMENT_INPUT_INVALID'));
  assert.equal(f.calls(),0);assert.equal(f.db.operations.length,0);
});
test('C7-B2B wrong UID/session, rotated session and deletion are all fail-closed',async()=>{
  const f=fixture(),svc=f.make();
  await assert.rejects(svc.settle(OTHER,SID,one()),failCode('SETTLEMENT_NOT_ALLOWED'));
  await assert.rejects(svc.settle(UID,OTHER_SID,one()),failCode('SESSION_EXPIRED'));
  f.db.data.get(userPath).sessionId=OTHER_SID;
  await assert.rejects(svc.settle(UID,SID,one()),failCode('SESSION_EXPIRED'));
  f.db.data.get(userPath).sessionId=SID;
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(svc.settle(UID,SID,one()),failCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);
  f.db.data.get(userPath).accountDeletion={status:'pending'};
  await assert.rejects(svc.settle(UID,SID,one()),failCode('ACCOUNT_DELETION_PENDING'));
  assert.equal(f.db.operations.length,0);assert.equal(f.calls(),0);
});
test('C7-B2B ALL C7-B2A QA receipts and proofs reject even with rewritten markers',async()=>{
  const variants=[
    {qaOnly:true,nonEconomic:true,safeForCloudBattle:false,settlementEnabled:false,
      phase:'lab-clear',version:'v8-c7b2-genesis-replay-audit-v1'},
    {qaOnly:true}, {safeForCloudBattle:false}, {settlementEnabled:false},
    {phase:'lab-clear'},{phase:'lab-defeat'},
    {nonEconomic:true},{version:'v8-c7b2-genesis-replay-audit-v1'},
    {reward:{coins:999999}},{victory:true},
  ];
  for(const grantOverrides of variants){
    const f=fixture({grantOverrides}),svc=f.make();
    await assert.rejects(svc.settle(UID,SID,one()),
      failCode('SETTLEMENT_PRODUCTION_PROOF_REQUIRED'));
    assert.equal(f.db.operations.length,0);
    assert.equal(f.db.data.get(userPath).wallet.coins,100);
  }
});
test('C7-B2B rejects cross-user or cross-battle verifier grant and stale grant',async()=>{
  for(const grantOverrides of [{uid:OTHER},{sessionId:OTHER_SID},{battleId:OTHER_BID},
    {verifiedAtMs:T0-11*60*1000},{verifiedAtMs:T0+99999},
    {verifiedTicks:4501},{planetId:2},{stage:2},{mode:'dungeon'},
    {catalogVersion:'product-old'},{inputDigest:'not-a-digest'}]){
    const f=fixture({grantOverrides}),svc=f.make();
    await assert.rejects(svc.settle(UID,SID,one()),
      failCode('SETTLEMENT_PRODUCTION_PROOF_REQUIRED'));
    assert.equal(f.db.operations.length,0);
  }
});
test('C7-B2B wallet overflow or daily limits roll back every write',async()=>{
  for(const alter of [
    u=>{u.wallet.coins=1000000000;},
    u=>{u.wallet.coins=-1;},
    u=>{u.security.battleCoins=499999;},
    u=>{u.security.battleWins=50;},
    u=>{u.progress.exp=1000000000;},
  ]){
    const f=fixture(),svc=f.make(),u=f.db.data.get(userPath);alter(u);
    const before=structuredClone(u);
    await assert.rejects(svc.settle(UID,SID,one()));
    assert.deepEqual(f.db.data.get(userPath),before);
    assert.equal(f.db.operations.length,0);
  }
});
test('C7-B2B transaction failure leaves user/ledger/operations unchanged',async()=>{
  const f=fixture(),svc=f.make();f.db.rejectCommit=true;
  const before=structuredClone(f.db.data.get(userPath));
  await assert.rejects(svc.settle(UID,SID,one()),/COMMIT_INJECTED_FAILURE/);
  assert.deepEqual(f.db.data.get(userPath),before);
  assert.equal(f.db.data.has(ledgerPath),false);
  assert.equal(f.db.data.has(operationPath),false);
  assert.equal(f.db.operations.length,0);
});
test('C7-B2B stored ledger tamper and missing operation are rejected on retry',async()=>{
  const f=fixture(),svc=f.make();await svc.settle(UID,SID,one());
  f.db.data.get(ledgerPath).coins=9000;
  await assert.rejects(svc.settle(UID,SID,one()),failCode('SETTLEMENT_LEDGER_INVALID'));
  assert.equal(f.db.data.get(userPath).wallet.coins,550);
  f.db.data.get(ledgerPath).coins=450;
  f.db.data.delete(operationPath);
  await assert.rejects(svc.settle(UID,SID,one()),failCode('SETTLEMENT_LEDGER_INVALID'));
});
test('C7-B2B no settlement route or GameService command exists, legacy P0 remains unchanged',()=>{
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  const gameService=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.equal(server.includes('verifiedSettlementC7B2BV8'),false);
  assert.equal(server.includes('/api/v1/battle/settle'),false);
  assert.equal(server.includes('/api/v1/qa/battle/settle'),false);
  assert.equal(gameService.includes('verifiedSettlementC7B2BV8'),false);
  assert.match(gameService,/command === 'battle.start'/);
  assert.match(gameService,/BATTLE_VERIFICATION_UNAVAILABLE/);
});
