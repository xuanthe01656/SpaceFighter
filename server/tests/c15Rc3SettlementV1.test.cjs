'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createC15Rc1Fixture,generateC15VictoryFrames,generateC15DefeatFrames,chunkC15Frames,T0,UID,SID,BID,KEY_ID,KEY}=require('../tools/c15Rc1Fixture.cjs');
const {replayC15CommercialFoundationV1}=require('../lib/c15CommercialReplayV1.cjs');
const {validateChunk}=require('../lib/combatInputJournalV8.cjs');
const {createC15TrustedOutcomeV1}=require('../lib/c15TrustedOutcomeV1.cjs');
const {ARCADE_PROFILE_ID,LEGACY_ARCADE_PROFILE_ID}=require('../lib/c15ControlProfilesV1.cjs');
const {createC15Rc3SettlementV1,parseC15Rc3SettlementConfig,verifyC15Rc3SettlementReceiptV1,
  REWARD_POLICY_VERSION}=require('../lib/c15Rc3SettlementV1.cjs');

const OUTCOME_KEY_ID='c15_rc2_outcome_v1',OUTCOME_KEY=Buffer.alloc(32,0x72);
const RECEIPT_KEY_ID='c15_rc3_receipt_v1',RECEIPT_KEY=Buffer.alloc(32,0x73);
const REQUEST='c15_rc3_claim_0001',OTHER_REQUEST='c15_rc3_claim_0002';
const OTHER_UID='other_c15_rc3_user',OTHER_SID='11111111-1111-4111-8111-111111111111';
const failCode=code=>error=>error?.code===code;
class Query{constructor(db,p){this.db=db;this.path=p;this.max=Number.MAX_SAFE_INTEGER;}orderBy(field){assert.equal(field,'startTick');return this;}limit(n){this.max=n;return this;}
  async get(){const docs=[...this.db.data].filter(([p])=>p.startsWith(this.path+'/')&&p.slice(this.path.length+1).indexOf('/')===-1)
    .map(([p,v])=>({id:p.slice(p.lastIndexOf('/')+1),raw:v,data:()=>structuredClone(v)}))
    .sort((a,b)=>a.raw.startTick-b.raw.startTick).slice(0,this.max);return {docs:docs.map(({id,data})=>({id,data}))};}}
class Ref{constructor(db,p){this.db=db;this.path=p;}doc(id){return new Ref(this.db,`${this.path}/${id}`);}collection(id){return new Ref(this.db,`${this.path}/${id}`);}
  orderBy(field){return new Query(this.db,this.path).orderBy(field);}async get(){const value=this.db.data.get(this.path);return {exists:value!==undefined,data:()=>structuredClone(value)};}}
class FakeDb{constructor(seed){this.data=new Map([...seed].map(([k,v])=>[k,structuredClone(v)]));this.ops=[];this.tail=Promise.resolve();this.rejectCommit=false;}
  collection(id){return new Ref(this,id);}runTransaction(work){const task=async()=>{const pending=[];let wrote=false;
    const tx={get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');return ref.get();},
      create:(ref,value)=>{wrote=true;pending.push(['create',ref.path,structuredClone(value)]);},
      set:(ref,value)=>{wrote=true;pending.push(['set',ref.path,structuredClone(value)]);}};
    const result=await work(tx);if(this.rejectCommit)throw Error('COMMIT_INJECTED_FAILURE');
    if(pending.some(([kind,p])=>kind==='create'&&this.data.has(p)))throw Error('DUPLICATE_CREATE');
    for(const [kind,p,v] of pending){this.data.set(p,v);this.ops.push({kind,path:p});}return result;};
    const run=this.tail.then(task,task);this.tail=run.catch(()=>{});return run;}}
let catalog,schema,clearSeed,defeatSeed,legacyClearSeed,clearAt,defeatAt,legacyClearAt;
const userPath=`users/${UID}`,sessionPath=`${userPath}/c15Rc1bSessions/current`;
const receiptPath=`${userPath}/c15Rc3Settlements/${BID}`;
const opPath=request=>`${userPath}/operations/${request}`;
function storedChunks(chunks){return chunks.map(chunk=>{const checked=validateChunk(chunk);return {version:'c15-rc1b-chunk-v1',battleId:BID,
  startTick:chunk.startTick,endTick:checked.endTick,frames:chunk.frames.map(frame=>({...frame})),chunkDigest:checked.chunkDigest,receivedAtMs:T0+checked.endTick*34};});}
async function buildSeed(kind,profileId=ARCADE_PROFILE_ID){const fixture=await createC15Rc1Fixture({profileId,battleId:BID,seed:kind==='clear'?11335577:11335578});
  const generated=kind==='clear'?generateC15VictoryFrames(fixture):generateC15DefeatFrames(fixture),chunks=chunkC15Frames(generated.frames,BID);
  const at=T0+Math.ceil(generated.frames.length*1000/30)+5000;
  const result=replayC15CommercialFoundationV1({origin:fixture.origin,chunks,nowMs:at,keyRing:fixture.keyRing});
  const stored=storedChunks(chunks);const outcome=createC15TrustedOutcomeV1({origin:fixture.origin,replayResult:result,chunks:stored,
    keyId:OUTCOME_KEY_ID,key:OUTCOME_KEY,issuedAtMs:at,keyRing:fixture.keyRing});
  const campaign=schema.createDefaultCampaignData();const user=schema.createProfileDocument({coins:100,diamonds:10,energy:42,campaignData:campaign},
    {displayName:'RC3 QA',photoURL:''},T0);user.sessionId=SID;user.profile.customProperty='keep';user.security={battleDay:'2026-06-21',battleCoins:0,battleWins:0,battleDiamonds:0,battleStarts:1};
  const seed=new Map([[userPath,user],[sessionPath,{version:'c15-rc1b-runtime-v1',uid:UID,sessionId:SID,battleId:BID,phase:'finalized',
    uploadedThroughTick:result.ticks,chunkCount:stored.length,outcomeDigest:outcome.outcomeDigest,nonEconomic:true,safeForSettlement:false}],
    [`${userPath}/c15Rc1bOrigins/${BID}`,fixture.origin],[`${userPath}/c15Rc1bResults/${BID}`,result],[`${userPath}/c15Rc2Outcomes/${BID}`,outcome]]);
  stored.forEach(value=>seed.set(`${userPath}/c15Rc1bTrace/${BID}/chunks/${String(value.startTick).padStart(6,'0')}`,value));
  return {seed,fixture,result,outcome,at};}
test.before(async()=>{[catalog,schema]=await Promise.all([import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href)]);
  const clear=await buildSeed('clear'),defeat=await buildSeed('defeat'),legacy=await buildSeed('clear',LEGACY_ARCADE_PROFILE_ID);
  clearSeed=clear.seed;defeatSeed=defeat.seed;legacyClearSeed=legacy.seed;clearAt=clear.at;defeatAt=defeat.at;legacyClearAt=legacy.at;});
function service(seed,at,{enabled=true,allowedUids=[UID]}={}){const db=new FakeDb(seed);let clock=at+1000;
  const create=()=>createC15Rc3SettlementV1({db,enabled,allowedUids,genesisVerificationKeys:new Map([[KEY_ID,KEY]]),
    outcomeVerificationKeys:new Map([[OUTCOME_KEY_ID,OUTCOME_KEY]]),receiptSigningKeyId:RECEIPT_KEY_ID,receiptSigningKey:RECEIPT_KEY,
    receiptVerificationKeys:new Map([[RECEIPT_KEY_ID,RECEIPT_KEY]]),catalogModule:catalog,schemaModule:schema,now:()=>clock});
  return {db,create,setTime:value=>{clock=value;}};}
const body=(requestId=REQUEST,seed=clearSeed)=>({battleId:BID,outcomeDigest:seed.get(`${userPath}/c15Rc2Outcomes/${BID}`).outcomeDigest,requestId});

test('RC3 config is default OFF and requires separate closed allowlist plus three HMAC keys',()=>{
  assert.equal(parseC15Rc3SettlementConfig({}),null);
  assert.throws(()=>parseC15Rc3SettlementConfig({GAME_C15_RC3_SETTLEMENT_ENABLED:'true'}),/approval/);
  const env={GAME_C15_RC3_SETTLEMENT_ENABLED:'true',GAME_C15_RC3_SETTLEMENT_STAGING_APPROVED:'true',
    GAME_C15_RC3_SETTLEMENT_ALLOW_UIDS:UID,GAME_C15_RC1B_HMAC_KEY_ID:KEY_ID,GAME_C15_RC1B_HMAC_KEY_B64:KEY.toString('base64'),
    GAME_C15_RC2_OUTCOME_HMAC_KEY_ID:OUTCOME_KEY_ID,GAME_C15_RC2_OUTCOME_HMAC_KEY_B64:OUTCOME_KEY.toString('base64'),
    GAME_C15_RC3_RECEIPT_HMAC_KEY_ID:RECEIPT_KEY_ID,GAME_C15_RC3_RECEIPT_HMAC_KEY_B64:RECEIPT_KEY.toString('base64')};
  const parsed=parseC15Rc3SettlementConfig(env);assert.deepEqual(parsed.uids,[UID]);assert.equal(parsed.receipt.keyId,RECEIPT_KEY_ID);
});
test('RC3 default OFF blocks before any transaction or mutation',async()=>{const f=service(clearSeed,clearAt,{enabled:false}),svc=await f.create();
  await assert.rejects(svc.settle(UID,SID,body()),failCode('C15_RC3_SETTLEMENT_DISABLED'));assert.equal(f.db.ops.length,0);});
test('RC3 clear atomically grants server policy and HMAC-signed immutable receipt',async()=>{const f=service(clearSeed,clearAt),svc=await f.create();
  const out=await svc.settle(UID,SID,body());assert.deepEqual({coins:out.receipt.coins,experience:out.receipt.experience,stars:out.receipt.stars},
    {coins:450,experience:100,stars:1});assert.equal(out.duplicate,false);assert.equal(out.stagingOnly,true);
  assert.equal(verifyC15Rc3SettlementReceiptV1(out.receipt,{[RECEIPT_KEY_ID]:RECEIPT_KEY},{uid:UID,battleId:BID}),true);
  const user=f.db.data.get(userPath);assert.equal(user.wallet.coins,550);assert.equal(user.progress.exp,100);
  assert.equal(user.progress.planets[1].stars[1],1);assert.equal(user.missions.progress.d_play_3,1);assert.equal(user.missions.progress.m_clear_planet,1);
  assert.equal(user.profile.customProperty,'keep');assert.deepEqual(f.db.ops.map(x=>x.path),[userPath,receiptPath,opPath(REQUEST)]);
  assert.equal(out.receipt.rewardPolicyVersion,REWARD_POLICY_VERSION);assert.equal(out.productionSettlementEnabled,false);assert.equal(out.productionCloudRewards,false);
});
test('RC5 settlement accepts new V2 outcomes and preserves legacy arcade V1 receipt verification',async()=>{
  const modern=service(clearSeed,clearAt),modernService=await modern.create(),modernOut=await modernService.settle(UID,SID,body());
  assert.equal(modernOut.receipt.controlProfileId,ARCADE_PROFILE_ID);
  const legacy=service(legacyClearSeed,legacyClearAt),legacyService=await legacy.create(),legacyOut=await legacyService.settle(UID,SID,body(REQUEST,legacyClearSeed));
  assert.equal(legacyOut.receipt.controlProfileId,LEGACY_ARCADE_PROFILE_ID);
  assert.equal(verifyC15Rc3SettlementReceiptV1(legacyOut.receipt,{[RECEIPT_KEY_ID]:RECEIPT_KEY},{uid:UID,battleId:BID}),true);
});
test('RC3 defeat settles once with zero economy and one verified play mission',async()=>{const f=service(defeatSeed,defeatAt),svc=await f.create();
  const out=await svc.settle(UID,SID,body(REQUEST,defeatSeed));assert.equal(out.receipt.coins,0);assert.equal(out.receipt.experience,0);assert.equal(out.receipt.stars,0);
  const user=f.db.data.get(userPath);assert.equal(user.wallet.coins,100);assert.equal(user.progress.exp,0);assert.equal(user.missions.progress.d_play_3,1);
  assert.equal(user.missions.progress.m_clear_planet,0);});
test('RC3 retries and 10 concurrent claims credit exactly once',async()=>{const f=service(clearSeed,clearAt),svc=await f.create();
  const values=await Promise.all(Array.from({length:10},()=>svc.settle(UID,SID,body())));assert.equal(values.filter(v=>!v.duplicate).length,1);
  const retry=await svc.settle(UID,SID,body()),newRequest=await svc.settle(UID,SID,body(OTHER_REQUEST));assert.equal(retry.duplicate,true);assert.equal(newRequest.duplicate,true);
  assert.equal(f.db.data.get(userPath).wallet.coins,550);assert.equal(f.db.ops.length,3);});
test('RC3 accepts no client-controlled economic or outcome fields',async()=>{const f=service(clearSeed,clearAt),svc=await f.create();
  for(const value of [{...body(),coins:999999},{...body(),victory:true},{...body(),stars:3},{battleId:BID,requestId:REQUEST},null])
    await assert.rejects(svc.settle(UID,SID,value),failCode('C15_RC3_INPUT_INVALID'));
  assert.equal(f.db.ops.length,0);});
test('RC3 rejects wrong user/session, deletion, stale outcome and unselected control profile',async()=>{
  const f=service(clearSeed,clearAt),svc=await f.create();await assert.rejects(svc.settle(OTHER_UID,SID,body()),failCode('C15_RC3_NOT_ALLOWED'));
  await assert.rejects(svc.settle(UID,OTHER_SID,body()),failCode('SESSION_EXPIRED'));
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});await assert.rejects(svc.settle(UID,SID,body()),failCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);f.setTime(clearAt+24*60*60*1000+1);await assert.rejects(svc.settle(UID,SID,body()),failCode('C15_RC3_OUTCOME_EXPIRED'));
  const g=service(clearSeed,clearAt),outcome=g.db.data.get(`${userPath}/c15Rc2Outcomes/${BID}`);outcome.controlProfileId='current-balanced-v1';g.db.data.set(`${userPath}/c15Rc2Outcomes/${BID}`,outcome);
  const gsvc=await g.create();await assert.rejects(gsvc.settle(UID,SID,body()),error=>error?.code==='C15_RC3_CONTROL_PROFILE_UNSUPPORTED');
});
test('RC3 rejects outcome, journal, result, origin and stored receipt tamper',async()=>{
  for(const mutate of [
    db=>{db.data.get(`${userPath}/c15Rc2Outcomes/${BID}`).kills=69;},
    db=>{db.data.get(`${userPath}/c15Rc1bResults/${BID}`).kills=69;},
    db=>{db.data.get(`${userPath}/c15Rc1bOrigins/${BID}`).originDigest='f'.repeat(64);},
    db=>{const first=[...db.data.keys()].find(x=>x.includes('/c15Rc1bTrace/')&&x.endsWith('/000000'));db.data.get(first).chunkDigest='f'.repeat(64);},
  ]){const f=service(clearSeed,clearAt),svc=await f.create();mutate(f.db);await assert.rejects(svc.settle(UID,SID,body()));assert.equal(f.db.ops.length,0);}
  const f=service(clearSeed,clearAt),svc=await f.create();await svc.settle(UID,SID,body());f.db.data.get(receiptPath).coins=999;
  await assert.rejects(svc.settle(UID,SID,body()),failCode('C15_RC3_RECEIPT_INVALID'));assert.equal(f.db.data.get(userPath).wallet.coins,550);
});
test('RC3 duplicate settlement rejects missing or tampered paired operation records',async()=>{
  for(const mutate of [
    db=>db.data.delete(opPath(REQUEST)),
    db=>{db.data.get(opPath(REQUEST)).payloadHash='f'.repeat(64);},
    db=>{db.data.get(opPath(REQUEST)).extra.receiptDigest='f'.repeat(64);},
  ]){const f=service(clearSeed,clearAt),svc=await f.create();await svc.settle(UID,SID,body());mutate(f.db);
    await assert.rejects(svc.settle(UID,SID,body(OTHER_REQUEST)),failCode('C15_RC3_RECEIPT_INVALID'));
    assert.equal(f.db.data.get(userPath).wallet.coins,550);}
});
test('RC3 commit failure rolls back profile, receipt and operation',async()=>{const f=service(clearSeed,clearAt),svc=await f.create(),before=structuredClone(f.db.data.get(userPath));
  f.db.rejectCommit=true;await assert.rejects(svc.settle(UID,SID,body()),/COMMIT_INJECTED_FAILURE/);assert.deepEqual(f.db.data.get(userPath),before);
  assert.equal(f.db.data.has(receiptPath),false);assert.equal(f.db.data.has(opPath(REQUEST)),false);assert.equal(f.db.ops.length,0);});
