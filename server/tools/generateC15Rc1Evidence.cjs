'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {C15_RULES_DOCUMENT,c15Digest}=require('../lib/c15RulesV2.cjs');
const {replayC15CommercialFoundationV1}=require('../lib/c15CommercialReplayV1.cjs');
const {createC15Rc1Fixture,generateC15VictoryFrames,generateC15DefeatFrames,
  chunkC15Frames,T0}=require('./c15Rc1Fixture.cjs');
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function gitHead(root){try{return execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return 'unknown';}}
async function journalCapacity(){
  const mod=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/combat/C15LocalJournal.js')).href);
  const bid='a2e2ee38-1cd8-4c5f-869b-56e31f6300a1';
  let s=mod.openC15LocalJournal({battleId:bid,rulesVersion:'c15-rules-v2.0.0',loadoutHash:'a'.repeat(64),issuedAtMs:1});
  for(let i=0;i<4500;i++){
    s=mod.appendC15LocalFrame(s,{x:0,z:0});
    const out=mod.takeC15UploadChunk(s);
    if(out.chunk)s=mod.acknowledgeC15UploadChunk(out.state,{startTick:out.chunk.startTick,endTick:out.chunk.startTick+out.chunk.frames.length});
  }
  while(s.pending.length){const out=mod.takeC15UploadChunk(s,{flush:true});s=mod.acknowledgeC15UploadChunk(out.state,{startTick:out.chunk.startTick,endTick:out.chunk.startTick+out.chunk.frames.length});}
  s=mod.closeC15LocalJournal(s);return mod.c15JournalSummary(s);
}
async function main(){
  const root=path.resolve(__dirname,'../..');
  const output=path.resolve(arg('--output-dir')||path.join(root,'client','dist','c15-rc1'));
  fs.mkdirSync(output,{recursive:true});
  const fixture=await createC15Rc1Fixture();
  const victory=generateC15VictoryFrames(fixture);const victoryChunks=chunkC15Frames(victory.frames,fixture.battleId);
  const victoryResult=replayC15CommercialFoundationV1({origin:fixture.origin,chunks:victoryChunks,
    nowMs:T0+Math.ceil(victory.frames.length*1000/30)+5000,keyRing:fixture.keyRing});
  const defeatFixture=await createC15Rc1Fixture({battleId:'82e2ee38-1cd8-4c5f-869b-56e31f6300a2',seed:11335578});
  const defeat=generateC15DefeatFrames(defeatFixture);const defeatChunks=chunkC15Frames(defeat.frames,defeatFixture.battleId);
  const defeatResult=replayC15CommercialFoundationV1({origin:defeatFixture.origin,chunks:defeatChunks,
    nowMs:T0+Math.ceil(defeat.frames.length*1000/30)+5000,keyRing:defeatFixture.keyRing});
  const capacity=await journalCapacity();
  const c12Files=['server/server.js','server/lib/productionBattleCandidateC11V8.cjs','server/lib/productionCandidateRuntimeC12V8.cjs'];
  const c12Frozen=c12Files.every(file=>fs.existsSync(path.join(root,file)))
    && !fs.readFileSync(path.join(root,'server/lib/productionBattleCandidateC11V8.cjs'),'utf8').includes('verifiedSettlementC7B2BV8')
    && !fs.readFileSync(path.join(root,'server/server.js'),'utf8').includes('/api/v1/battle/settle');
  const report={version:'c15-rc1-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),
    gitHead:gitHead(root),baselineTag:'c15-rc0-c12-candidate-frozen',c12Frozen,
    rules:{version:C15_RULES_DOCUMENT.version,digest:c15Digest(['sf-c15-rules-document',C15_RULES_DOCUMENT]),
      maxBattleTicks:C15_RULES_DOCUMENT.maxBattleTicks,maxJournalChunks:C15_RULES_DOCUMENT.maxJournalChunks},
    resources:{manifestVersion:fixture.resourceManifest.version,manifestDigest:fixture.resourceManifest.manifestDigest,
      selectedPacks:fixture.origin.genesis.resourcePacks.map(x=>x.id)},
    victory:{phase:victoryResult.phase,ticks:victoryResult.ticks,chunks:victoryResult.chunks,
      waves:victoryResult.waves,kills:victoryResult.kills,replayDigest:victoryResult.replayDigest},
    defeat:{phase:defeatResult.phase,ticks:defeatResult.ticks,chunks:defeatResult.chunks,
      waves:defeatResult.waves,hp:defeatResult.hp,replayDigest:defeatResult.replayDigest},
    journalCapacity:{ticks:capacity.ticks,chunks:capacity.chunks,closed:capacity.closed},
    safety:{rc1Only:true,nonEconomic:true,safeForSettlement:false,cloudRewards:false}};
  if(!c12Frozen||report.victory.phase!=='rc1-verified-clear'||report.victory.waves!==5||report.victory.kills!==70
    ||report.defeat.phase!=='rc1-verified-defeat'||report.defeat.hp!==0
    ||capacity.ticks!==4500||capacity.chunks<151||capacity.chunks>256)throw new Error('C15 RC1 evidence gate failed');
  fs.writeFileSync(path.join(output,'C15_RC1_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  const md=`# SpaceFighter C15-RC1 Gate Report\n\n- Status: **${report.status}**\n- Git HEAD: \`${report.gitHead}\`\n- C12 frozen: **${report.c12Frozen}**\n- Rules: \`${report.rules.version}\`\n- Resource manifest: \`${report.resources.manifestVersion}\`\n- Victory: ${report.victory.waves} waves, ${report.victory.kills} kills, ${report.victory.ticks} ticks, ${report.victory.chunks} chunks\n- Defeat: HP ${report.defeat.hp}, ${report.defeat.ticks} ticks, ${report.defeat.chunks} chunks\n- Capacity: ${report.journalCapacity.ticks} ticks / ${report.journalCapacity.chunks} chunks\n- Settlement enabled: **false**\n- Cloud rewards: **false**\n`;
  fs.writeFileSync(path.join(output,'C15_RC1_GATE_REPORT.md'),md);
  console.log(`C15_RC1_EVIDENCE_PASS ${path.join(output,'C15_RC1_GATE_REPORT.json')}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
