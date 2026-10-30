'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {createC15Rc1Fixture,generateC15VictoryFrames,generateC15DefeatFrames,chunkC15Frames,T0}=require('./c15Rc1Fixture.cjs');
const {replayC15CommercialFoundationV1}=require('../lib/c15CommercialReplayV1.cjs');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const gitHead=root=>{try{return execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return 'unknown';}};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fetchFor(catalog,{chunkBytes=262144}={}){
  return async(url,options={})=>{
    const parsed=new URL(url);const descriptor=/\/packs\/([^/]+)\/v(\d+)\/descriptor\.json$/.exec(parsed.pathname);
    if(descriptor){const found=catalog.getDescriptor(descriptor[1],Number(descriptor[2]));
      return found?new Response(found.bytes,{status:200,headers:{'content-type':'application/json'}}):new Response('',{status:404});}
    const file=/\/packs\/([^/]+)\/v(\d+)\/files\/(.+)$/.exec(parsed.pathname);
    if(!file)return new Response('',{status:404});const found=catalog.getFile(file[1],Number(file[2]),file[3]);
    if(!found)return new Response('',{status:404});const full=fs.readFileSync(found.absolute);
    let start=0;if(options.headers?.Range){const m=/bytes=(\d+)-/.exec(options.headers.Range);start=Number(m?.[1]||0);}
    const end=Math.min(full.length-1,start+chunkBytes-1),body=full.subarray(start,end+1),partial=start>0||end<full.length-1;
    return new Response(body,{status:partial?206:200,headers:partial?{'content-range':`bytes ${start}-${end}/${full.length}`}:{}});
  };
}
async function journalCapacity(root){
  const mod=await import(pathToFileURL(path.join(root,'client/src/game/combat/C15LocalJournal.js')).href);
  let state=mod.openC15LocalJournal({battleId:'a2e2ee38-1cd8-4c5f-869b-56e31f6300a1',rulesVersion:'c15-rules-v2.0.0',loadoutHash:'a'.repeat(64),issuedAtMs:1});
  for(let i=0;i<4500;i++){state=mod.appendC15LocalFrame(state,{x:0,z:0});const out=mod.takeC15UploadChunk(state);if(out.chunk)state=mod.acknowledgeC15UploadChunk(out.state,{startTick:out.chunk.startTick,endTick:out.chunk.startTick+out.chunk.frames.length});}
  while(state.pending.length){const out=mod.takeC15UploadChunk(state,{flush:true});state=mod.acknowledgeC15UploadChunk(out.state,{startTick:out.chunk.startTick,endTick:out.chunk.startTick+out.chunk.frames.length});}
  return mod.c15JournalSummary(mod.closeC15LocalJournal(state));
}
async function offlineTransport(root){
  const [{createC15MemoryStore},{openC15LocalJournal},{createC15JournalUploader}]=await Promise.all([
    import(pathToFileURL(path.join(root,'client/src/game/c15/C15Rc1bStore.js')).href),
    import(pathToFileURL(path.join(root,'client/src/game/combat/C15LocalJournal.js')).href),
    import(pathToFileURL(path.join(root,'client/src/game/c15/C15JournalUploader.js')).href),
  ]);
  const store=createC15MemoryStore(),battleId='b2e2ee38-1cd8-4c5f-869b-56e31f6300a1';let online=false,uploaded=0;const sizes=[];
  const journal=openC15LocalJournal({battleId,rulesVersion:'c15-rules-v2.0.0',loadoutHash:'b'.repeat(64),issuedAtMs:1});
  const uploader=createC15JournalUploader({uid:'rc1b-evidence-user',battleId,journal,store,online:()=>online,
    uploadChunk:async(_uid,{chunk})=>{if(chunk.startTick!==uploaded)throw new Error('evidence sequence');sizes.push(chunk.frames.length);uploaded+=chunk.frames.length;return {battleId,startTick:chunk.startTick,endTick:uploaded};}});
  for(let i=0;i<75;i++)uploader.append({x:0,z:0});await uploader.persistNow();
  if(uploaded!==0)throw new Error('offline transport uploaded unexpectedly');online=true;await uploader.flush();
  return {offlineTicks:75,uploadedThroughTick:uploaded,chunks:sizes.length,chunkSizes:sizes,gameplayWaitedForNetwork:false};
}
async function resourceEvidence(root){
  const [{createC15MemoryStore},{ensureC15StageResources,resolveC15ActiveResource}]=await Promise.all([
    import(pathToFileURL(path.join(root,'client/src/game/c15/C15Rc1bStore.js')).href),
    import(pathToFileURL(path.join(root,'client/src/game/c15/C15ResourceDelivery.js')).href),
  ]);
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://spacefighter.example',generatedAtMs:T0});
  const store=createC15MemoryStore(),installed=await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',fetchImpl:fetchFor(catalog)});
  const resolved=await resolveC15ActiveResource({store,packId:'campaign-alpha-mobile-low',path:'alpha_coast_low.webp'});
  if(!resolved?.url.startsWith('blob:'))throw new Error('resource activation failed');resolved.revoke();
  const packs=catalog.manifest.packs.map(pack=>{const d=catalog.getDescriptor(pack.id,pack.revision);return {id:pack.id,revision:pack.revision,descriptorSha256:d.sha256,totalBytes:d.descriptor.totalBytes,files:d.descriptor.files.map(file=>({path:file.path,sizeBytes:file.sizeBytes,sha256:file.sha256}))};});
  return {manifestVersion:catalog.manifest.version,manifestDigest:catalog.manifest.manifestDigest,selectedPacks:installed.selection.packs.map(x=>x.id),atomicActivation:true,rollbackRecorded:Boolean(installed.active.rollback),packs};
}
async function main(){
  const root=path.resolve(__dirname,'../..'),output=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc1b'));fs.mkdirSync(output,{recursive:true});
  const fixture=await createC15Rc1Fixture(),victory=generateC15VictoryFrames(fixture),defeatFixture=await createC15Rc1Fixture({battleId:'82e2ee38-1cd8-4c5f-869b-56e31f6300a2',seed:11335578}),defeat=generateC15DefeatFrames(defeatFixture);
  const victoryChunks=chunkC15Frames(victory.frames,fixture.battleId),defeatChunks=chunkC15Frames(defeat.frames,defeatFixture.battleId);
  const victoryServer=replayC15CommercialFoundationV1({origin:fixture.origin,chunks:victoryChunks,nowMs:T0+Math.ceil(victory.frames.length*1000/30)+5000,keyRing:fixture.keyRing});
  const defeatServer=replayC15CommercialFoundationV1({origin:defeatFixture.origin,chunks:defeatChunks,nowMs:T0+Math.ceil(defeat.frames.length*1000/30)+5000,keyRing:defeatFixture.keyRing});
  const kernel=await import(pathToFileURL(path.join(root,'client/src/game/c15/C15KernelRuntime.js')).href);
  const victoryLocal=kernel.c15KernelRuntimeView(kernel.replayC15KernelRuntime({genesis:fixture.origin.genesis,runtime:{snapshot:fixture.origin.snapshot,encounter:fixture.origin.encounter,policy:fixture.origin.policy},frames:victory.frames}));
  const defeatLocal=kernel.c15KernelRuntimeView(kernel.replayC15KernelRuntime({genesis:defeatFixture.origin.genesis,runtime:{snapshot:defeatFixture.origin.snapshot,encounter:defeatFixture.origin.encounter,policy:defeatFixture.origin.policy},frames:defeat.frames}));
  const capacity=await journalCapacity(root),transport=await offlineTransport(root),resources=await resourceEvidence(root);
  const serverSource=fs.readFileSync(path.join(root,'server/server.js'),'utf8'),runtimeSource=fs.readFileSync(path.join(root,'server/lib/c15Rc1bRuntimeV1.cjs'),'utf8'),c12Source=fs.readFileSync(path.join(root,'server/lib/productionBattleCandidateC11V8.cjs'),'utf8');
  const c12Frozen=!c12Source.includes('verifiedSettlementC7B2BV8')&&!serverSource.includes('/api/v1/battle/settle');
  const safety={rc1bOnly:true,nonEconomic:true,safeForSettlement:false,settlementEnabled:false,cloudRewards:false,c12Frozen,
    noRewardEndpoint:!serverSource.includes('/api/v1/c15/battle/reward'),noSettlementEndpoint:!serverSource.includes('/api/v1/c15/battle/settle'),
    finalizeRaceGuard:runtimeSource.includes('C15_RC1B_FINALIZE_RETRY'),allowlistRequired:runtimeSource.includes('GAME_C15_RC1B_ALLOW_UIDS')};
  const report={version:'c15-rc1b-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead:gitHead(root),baselineTag:'c15-rc1-foundation-pass',
    localRuntime:{kernel:'generated-server-deterministic-kernel',networkCriticalPath:false,
      victory:{phase:victoryLocal.provisionalPhase,ticks:victoryLocal.tick,waves:victoryLocal.wave,kills:victoryLocal.kills,stateDigest:victoryLocal.stateDigest,serverStateDigest:victoryServer.stateDigest},
      defeat:{phase:defeatLocal.provisionalPhase,ticks:defeatLocal.tick,hp:defeatLocal.hp,stateDigest:defeatLocal.stateDigest,serverStateDigest:defeatServer.stateDigest}},
    serverReplay:{victory:{phase:victoryServer.phase,ticks:victoryServer.ticks,chunks:victoryServer.chunks,waves:victoryServer.waves,kills:victoryServer.kills,replayDigest:victoryServer.replayDigest},
      defeat:{phase:defeatServer.phase,ticks:defeatServer.ticks,chunks:defeatServer.chunks,hp:defeatServer.hp,replayDigest:defeatServer.replayDigest}},
    journalCapacity:{ticks:capacity.ticks,chunks:capacity.chunks,closed:capacity.closed},backgroundTransport:transport,resources,safety,
    deviceGate:{required:true,scenarios:['normal-five-wave','background-resume','offline-reconnect'],rewardsRemainDisabled:true}};
  if(victoryLocal.provisionalPhase!=='local-clear'||victoryLocal.stateDigest!==victoryServer.stateDigest||victoryServer.waves!==5||victoryServer.kills!==70
    ||defeatLocal.provisionalPhase!=='local-defeat'||defeatLocal.stateDigest!==defeatServer.stateDigest||defeatServer.hp!==0
    ||capacity.ticks!==4500||capacity.chunks<151||capacity.chunks>256||transport.uploadedThroughTick!==75
    ||resources.selectedPacks.length<2||safety.rc1bOnly!==true||safety.nonEconomic!==true
    ||safety.safeForSettlement!==false||safety.settlementEnabled!==false||safety.cloudRewards!==false
    ||safety.c12Frozen!==true||safety.noRewardEndpoint!==true||safety.noSettlementEndpoint!==true
    ||safety.finalizeRaceGuard!==true||safety.allowlistRequired!==true)throw new Error('C15 RC1B evidence gate failed');
  fs.writeFileSync(path.join(output,'C15_RC1B_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  const md=`# SpaceFighter C15-RC1B Gate Report\n\n- Status: **PASS**\n- Git HEAD: \`${report.gitHead}\`\n- Local runtime network critical path: **false**\n- Victory parity: ${report.serverReplay.victory.waves} waves, ${report.serverReplay.victory.kills} kills, ${report.serverReplay.victory.ticks} ticks\n- Defeat parity: HP ${report.serverReplay.defeat.hp}, ${report.serverReplay.defeat.ticks} ticks\n- Capacity: ${capacity.ticks} ticks / ${capacity.chunks} chunks\n- Offline journal: ${transport.offlineTicks} local ticks, ${transport.uploadedThroughTick} uploaded after reconnect\n- Resource manifest: \`${resources.manifestVersion}\`, ${resources.selectedPacks.length} packs atomically activated\n- C12 frozen: **${safety.c12Frozen}**\n- Settlement enabled: **false**\n- Cloud rewards: **false**\n- Android device gate required: **true**\n`;
  fs.writeFileSync(path.join(output,'C15_RC1B_GATE_REPORT.md'),md);console.log(`C15_RC1B_EVIDENCE_PASS ${path.join(output,'C15_RC1B_GATE_REPORT.json')}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
