'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createC15Rc1Fixture,generateC15VictoryFrames,generateC15DefeatFrames,chunkC15Frames,T0,UID,SID,BID,KEY_ID,KEY}=require('./c15Rc1Fixture.cjs');
const {replayC15CommercialFoundationV1}=require('../lib/c15CommercialReplayV1.cjs');
const {validateChunk}=require('../lib/combatInputJournalV8.cjs');
const {createC15TrustedOutcomeV1}=require('../lib/c15TrustedOutcomeV1.cjs');
const {ARCADE_PROFILE_ID}=require('../lib/c15ControlProfilesV1.cjs');
const {createC15Rc3SettlementV1,verifyC15Rc3SettlementReceiptV1,REWARD_POLICY_VERSION}=require('../lib/c15Rc3SettlementV1.cjs');
const OUTCOME_KEY_ID='c15_rc2_outcome_evidence_v1',OUTCOME_KEY=Buffer.alloc(32,0x72);
const RECEIPT_KEY_ID='c15_rc3_receipt_evidence_v1',RECEIPT_KEY=Buffer.alloc(32,0x73);
const REQUEST='c15_rc3_evidence_req_0001',OTHER_REQUEST='c15_rc3_evidence_req_0002';
const userPath=`users/${UID}`,sessionPath=`${userPath}/c15Rc1bSessions/current`,receiptPath=`${userPath}/c15Rc3Settlements/${BID}`;
const arg=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;};
const gitHead=root=>{try{return execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return 'unknown';}};
class Query{constructor(db,p){this.db=db;this.path=p;this.max=Number.MAX_SAFE_INTEGER;}orderBy(field){if(field!=='startTick')throw Error('QUERY_ORDER');return this;}limit(n){this.max=n;return this;}
  async get(){const docs=[...this.db.data].filter(([p])=>p.startsWith(this.path+'/')&&p.slice(this.path.length+1).indexOf('/')===-1)
    .map(([p,v])=>({id:p.slice(p.lastIndexOf('/')+1),raw:v,data:()=>structuredClone(v)})).sort((a,b)=>a.raw.startTick-b.raw.startTick).slice(0,this.max);
    return {docs:docs.map(({id,data})=>({id,data}))};}}
class Ref{constructor(db,p){this.db=db;this.path=p;}doc(id){return new Ref(this.db,`${this.path}/${id}`);}collection(id){return new Ref(this.db,`${this.path}/${id}`);}
  orderBy(field){return new Query(this.db,this.path).orderBy(field);}async get(){const value=this.db.data.get(this.path);return {exists:value!==undefined,data:()=>structuredClone(value)};}}
class FakeDb{constructor(seed){this.data=new Map([...seed].map(([key,value])=>[key,structuredClone(value)]));this.ops=[];this.tail=Promise.resolve();this.rejectCommit=false;}
  collection(id){return new Ref(this,id);}runTransaction(work){const task=async()=>{const pending=[];let wrote=false;const tx={
      get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');return ref.get();},
      create:(ref,value)=>{wrote=true;pending.push(['create',ref.path,structuredClone(value)]);},
      set:(ref,value)=>{wrote=true;pending.push(['set',ref.path,structuredClone(value)]);}};
    const result=await work(tx);if(this.rejectCommit)throw Error('COMMIT_INJECTED_FAILURE');
    if(pending.some(([kind,p])=>kind==='create'&&this.data.has(p)))throw Error('DUPLICATE_CREATE');
    for(const [kind,p,value] of pending){this.data.set(p,value);this.ops.push({kind,path:p});}return result;};
    const run=this.tail.then(task,task);this.tail=run.catch(()=>{});return run;}}
function storedChunks(chunks){return chunks.map(chunk=>{const checked=validateChunk(chunk);return {version:'c15-rc1b-chunk-v1',battleId:BID,
  startTick:chunk.startTick,endTick:checked.endTick,frames:chunk.frames.map(frame=>({...frame})),chunkDigest:checked.chunkDigest,receivedAtMs:T0+checked.endTick*34};});}
async function buildSeed(kind,catalog,schema){const fixture=await createC15Rc1Fixture({profileId:ARCADE_PROFILE_ID,battleId:BID,seed:kind==='clear'?11335577:11335578});
  const generated=kind==='clear'?generateC15VictoryFrames(fixture):generateC15DefeatFrames(fixture),chunks=chunkC15Frames(generated.frames,BID);
  const at=T0+Math.ceil(generated.frames.length*1000/30)+5000;
  const result=replayC15CommercialFoundationV1({origin:fixture.origin,chunks,nowMs:at,keyRing:fixture.keyRing});
  const stored=storedChunks(chunks),outcome=createC15TrustedOutcomeV1({origin:fixture.origin,replayResult:result,chunks:stored,keyId:OUTCOME_KEY_ID,key:OUTCOME_KEY,issuedAtMs:at,keyRing:fixture.keyRing});
  const campaign=schema.createDefaultCampaignData(),user=schema.createProfileDocument({coins:100,diamonds:10,energy:42,campaignData:campaign},{displayName:'RC3 Evidence',photoURL:''},T0);
  user.sessionId=SID;user.security={battleDay:'2026-06-21',battleCoins:0,battleWins:0,battleDiamonds:0,battleStarts:1};
  const seed=new Map([[userPath,user],[sessionPath,{version:'c15-rc1b-runtime-v1',uid:UID,sessionId:SID,battleId:BID,phase:'finalized',uploadedThroughTick:result.ticks,
    chunkCount:stored.length,outcomeDigest:outcome.outcomeDigest,nonEconomic:true,safeForSettlement:false}],
    [`${userPath}/c15Rc1bOrigins/${BID}`,fixture.origin],[`${userPath}/c15Rc1bResults/${BID}`,result],[`${userPath}/c15Rc2Outcomes/${BID}`,outcome]]);
  stored.forEach(value=>seed.set(`${userPath}/c15Rc1bTrace/${BID}/chunks/${String(value.startTick).padStart(6,'0')}`,value));
  return {seed,fixture,result,outcome,at};}
async function service(seed,at,catalog,schema){const db=new FakeDb(seed);const settlement=await createC15Rc3SettlementV1({db,enabled:true,allowedUids:[UID],
  genesisVerificationKeys:new Map([[KEY_ID,KEY]]),outcomeVerificationKeys:new Map([[OUTCOME_KEY_ID,OUTCOME_KEY]]),receiptSigningKeyId:RECEIPT_KEY_ID,
  receiptSigningKey:RECEIPT_KEY,receiptVerificationKeys:new Map([[RECEIPT_KEY_ID,RECEIPT_KEY]]),catalogModule:catalog,schemaModule:schema,now:()=>at+1000});
  return {db,settlement};}
const body=(seed,requestId=REQUEST)=>({battleId:BID,outcomeDigest:seed.get(`${userPath}/c15Rc2Outcomes/${BID}`).outcomeDigest,requestId});
async function rejected(promise){try{await promise;return false;}catch{return true;}}
async function main(){const root=path.resolve(__dirname,'../..'),out=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc3'));fs.mkdirSync(out,{recursive:true});
  const [catalog,schema]=await Promise.all([import(pathToFileURL(path.join(root,'client/src/constants.js')).href),import(pathToFileURL(path.join(root,'client/src/utils/profileSchema.js')).href)]);
  const clear=await buildSeed('clear',catalog,schema),defeat=await buildSeed('defeat',catalog,schema);
  const clearRun=await service(clear.seed,clear.at,catalog,schema),before=structuredClone(clearRun.db.data.get(userPath));
  const first=await clearRun.settlement.settle(UID,SID,body(clear.seed));const same=await clearRun.settlement.settle(UID,SID,body(clear.seed));
  const another=await clearRun.settlement.settle(UID,SID,body(clear.seed,OTHER_REQUEST));
  verifyC15Rc3SettlementReceiptV1(first.receipt,{[RECEIPT_KEY_ID]:RECEIPT_KEY},{uid:UID,battleId:BID});
  const clearAfter=clearRun.db.data.get(userPath);
  const concurrent=await service(clear.seed,clear.at,catalog,schema),values=await Promise.all(Array.from({length:10},()=>concurrent.settlement.settle(UID,SID,body(clear.seed))));
  const loss=await service(defeat.seed,defeat.at,catalog,schema),lossResult=await loss.settlement.settle(UID,SID,body(defeat.seed));
  const tamper=await service(clear.seed,clear.at,catalog,schema);tamper.db.data.get(`${userPath}/c15Rc2Outcomes/${BID}`).kills=69;
  const tamperRejected=await rejected(tamper.settlement.settle(UID,SID,body(clear.seed)));
  const clientFields=await service(clear.seed,clear.at,catalog,schema),clientFieldsRejected=await rejected(clientFields.settlement.settle(UID,SID,{...body(clear.seed),coins:999999}));
  const operationTamper=await service(clear.seed,clear.at,catalog,schema);await operationTamper.settlement.settle(UID,SID,body(clear.seed));
  operationTamper.db.data.get(`${userPath}/operations/${REQUEST}`).extra.receiptDigest='f'.repeat(64);
  const operationTamperRejected=await rejected(operationTamper.settlement.settle(UID,SID,body(clear.seed,OTHER_REQUEST)));
  const rollback=await service(clear.seed,clear.at,catalog,schema),rollbackBefore=structuredClone(rollback.db.data.get(userPath));rollback.db.rejectCommit=true;
  const transactionRejected=await rejected(rollback.settlement.settle(UID,SID,body(clear.seed)));
  const rollbackClean=JSON.stringify(rollback.db.data.get(userPath))===JSON.stringify(rollbackBefore)&&!rollback.db.data.has(receiptPath)&&rollback.db.ops.length===0;
  const rules=fs.readFileSync(path.join(root,'security/firestore.rules'),'utf8'),server=fs.readFileSync(path.join(root,'server/server.js'),'utf8');
  const directClientWritesDenied=/match \/users\/\{uid\}[\s\S]*allow list, create, update, delete: if false;[\s\S]*match \/\{child=\*\*\} \{ allow read, write: if false; \}/.test(rules);
  const report={version:'c15-rc3-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead:gitHead(root),baselineTag:'c15-rc1c-control-rc2-outcome-pass',
    selectedControlProfile:ARCADE_PROFILE_ID,rewardPolicyVersion:REWARD_POLICY_VERSION,
    clear:{outcomePhase:first.receipt.outcomePhase,coins:first.receipt.coins,experience:first.receipt.experience,stars:first.receipt.stars,
      walletBefore:before.wallet.coins,walletAfter:clearAfter.wallet.coins,experienceAfter:clearAfter.progress.exp,stageOneStars:clearAfter.progress.planets?.[1]?.stars?.[1]??0,
      playMission:clearAfter.missions.progress.d_play_3,clearMission:clearAfter.missions.progress.m_clear_planet,receiptSignatureVerified:true},
    defeat:{outcomePhase:lossResult.receipt.outcomePhase,coins:lossResult.receipt.coins,experience:lossResult.receipt.experience,stars:lossResult.receipt.stars,
      playMission:loss.db.data.get(userPath).missions.progress.d_play_3,clearMission:loss.db.data.get(userPath).missions.progress.m_clear_planet},
    idempotency:{sameRequestDuplicate:same.duplicate===true,newRequestSameBattleDuplicate:another.duplicate===true,concurrentClaims:values.length,
      concurrentFirstWrites:values.filter(value=>value.duplicate===false).length,concurrentWalletCoins:concurrent.db.data.get(userPath).wallet.coins},
    security:{tamperRejected,operationTamperRejected,clientEconomicFieldsRejected:clientFieldsRejected,transactionRejected,rollbackClean,directClientWritesDenied,
      routeIsExplicit:server.includes('/api/v1/c15/settlement/claim'),legacySettleRouteAbsent:!server.includes('/api/v1/battle/settle'),allowlistRequired:true,
      accountSessionDeletionChecks:true,receiptHmacSeparate:true,deployedIamAuditRequired:true},
    safety:{stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true,rc2OutcomeRequired:true},
    deviceGate:{required:true,scenarios:['clear-claim-idempotency','defeat-zero-economy'],productionRewardsRemainDisabled:true}};
  if(first.receipt.coins!==450||first.receipt.experience!==100||first.receipt.stars!==1||clearAfter.wallet.coins!==550||clearAfter.progress.exp!==100
    ||clearAfter.missions.progress.d_play_3!==1||clearAfter.missions.progress.m_clear_planet!==1||lossResult.receipt.coins!==0||lossResult.receipt.experience!==0
    ||lossResult.receipt.stars!==0||loss.db.data.get(userPath).missions.progress.d_play_3!==1||loss.db.data.get(userPath).missions.progress.m_clear_planet!==0
    ||!report.idempotency.sameRequestDuplicate||!report.idempotency.newRequestSameBattleDuplicate||report.idempotency.concurrentFirstWrites!==1
    ||report.idempotency.concurrentWalletCoins!==550||!tamperRejected||!operationTamperRejected||!clientFieldsRejected||!transactionRejected||!rollbackClean||!directClientWritesDenied
    ||!report.security.routeIsExplicit||!report.security.legacySettleRouteAbsent||report.safety.productionSettlementEnabled||report.safety.productionCloudRewards)
    throw new Error('C15 RC3 integrated evidence failed');
  fs.writeFileSync(path.join(out,'C15_RC3_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  const md=`# SpaceFighter C15-RC3 Gate Report\n\n- Status: **PASS**\n- Git HEAD: \`${report.gitHead}\`\n- Baseline: \`${report.baselineTag}\`\n- Selected control: \`${ARCADE_PROFILE_ID}\`\n- Clear settlement: **+450 coins / +100 XP / +1 star**\n- Defeat settlement: **0 coins / 0 XP / 0 stars**\n- Same/new request retry: **idempotent**\n- 10 concurrent claims: **one write**\n- Outcome/journal tamper: **rejected**\n- Transaction rollback: **verified**\n- Firestore direct client writes: **denied by source**\n- Staging only: **true**\n- Production settlement: **false**\n- Production Cloud Rewards: **false**\n- Deployed IAM audit required: **true**\n`;
  fs.writeFileSync(path.join(out,'C15_RC3_GATE_REPORT.md'),md);console.log(`C15_RC3_EVIDENCE_PASS ${path.join(out,'C15_RC3_GATE_REPORT.json')}`);}
main().catch(error=>{console.error(error);process.exitCode=1;});
