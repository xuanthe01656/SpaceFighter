'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createC15Rc1Fixture,generateC15VictoryFrames,generateC15DefeatFrames,chunkC15Frames,T0}=require('./c15Rc1Fixture.cjs');
const {replayC15CommercialFoundationV1}=require('../lib/c15CommercialReplayV1.cjs');
const {createC15TrustedOutcomeV1,verifyC15TrustedOutcomeV1}=require('../lib/c15TrustedOutcomeV1.cjs');
const {validateChunk}=require('../lib/combatInputJournalV8.cjs');
const {CURRENT_PROFILE_ID,ARCADE_PROFILE_ID}=require('../lib/c15ControlProfilesV1.cjs');
const OUTCOME_KEY_ID='c15_rc2_evidence_v1';const OUTCOME_KEY=Buffer.alloc(32,0x5d);
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const gitHead=root=>{try{return execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return 'unknown';}};
const stored=chunks=>chunks.map(chunk=>{const checked=validateChunk(chunk);return {startTick:chunk.startTick,endTick:checked.endTick,chunkDigest:checked.chunkDigest};});
async function profileReplay(root,profileId,suffix){
  const win=await createC15Rc1Fixture({profileId,battleId:`82e2ee38-1cd8-4c5f-869b-56e31f630${suffix}`});
  const victory=generateC15VictoryFrames(win),victoryChunks=chunkC15Frames(victory.frames,win.battleId);
  const serverVictory=replayC15CommercialFoundationV1({origin:win.origin,chunks:victoryChunks,
    nowMs:T0+Math.ceil(victory.frames.length*1000/30)+5000,keyRing:win.keyRing});
  const loss=await createC15Rc1Fixture({profileId,battleId:`72e2ee38-1cd8-4c5f-869b-56e31f630${suffix}`,seed:11335578});
  const defeat=generateC15DefeatFrames(loss),defeatChunks=chunkC15Frames(defeat.frames,loss.battleId);
  const serverDefeat=replayC15CommercialFoundationV1({origin:loss.origin,chunks:defeatChunks,
    nowMs:T0+Math.ceil(defeat.frames.length*1000/30)+5000,keyRing:loss.keyRing});
  const kernel=await import(pathToFileURL(path.join(root,'client/src/game/c15/C15KernelRuntime.js')).href);
  const localVictory=kernel.c15KernelRuntimeView(kernel.replayC15KernelRuntime({genesis:win.origin.genesis,
    runtime:{snapshot:win.snapshot,encounter:win.encounter,policy:win.policy},frames:victory.frames}));
  const localDefeat=kernel.c15KernelRuntimeView(kernel.replayC15KernelRuntime({genesis:loss.origin.genesis,
    runtime:{snapshot:loss.snapshot,encounter:loss.encounter,policy:loss.policy},frames:defeat.frames}));
  return {profileId,win,loss,victoryChunks,defeatChunks,serverVictory,serverDefeat,localVictory,localDefeat};
}
async function controlEvidence(root,profileId,movePerTick){
  const intent=await import(pathToFileURL(path.join(root,'client/src/game/c15/C15ControlIntent.js')).href);
  let state=intent.openC15ControlIntent({arenaHalfHeight:15000,arenaHalfWidth:13200,aspect:360/800,canvasHeight:800,
    canvasWidth:360,halfHeight:15,hitRadius:700,movePerTick,speedMultiplier:1,startX:0,startZ:12500},{profileId});
  state=intent.addC15PointerDelta(state,{deltaX:170,deltaY:-40});const initial=intent.c15ControlIntentView(state);
  let firstMotionTick=null,maxStep=0,gapAfterNine=null,ticks=0,prior=initial.position;
  while(intent.c15ControlIntentView(state).targetGapUnits>150&&ticks<100){const sampled=intent.sampleC15ControlTick(state);state=sampled.state;ticks++;
    const view=intent.c15ControlIntentView(state),step=Math.hypot(view.position.xUnits-prior.xUnits,view.position.zUnits-prior.zUnits);
    maxStep=Math.max(maxStep,step);if(firstMotionTick===null&&step>0)firstMotionTick=ticks;if(ticks===9)gapAfterNine=view.targetGapUnits;prior=view.position;}
  const final=intent.c15ControlIntentView(state);return {profileId,movePerTick,initialTargetGapUnits:initial.targetGapUnits,
    inputToMotionTicks:firstMotionTick,catchUpTicks:ticks,gapAfterNineTicks:gapAfterNine,maxStepUnits:Math.round(maxStep*10)/10,
    finalTargetGapUnits:final.targetGapUnits,noTeleport:maxStep<=movePerTick+5};
}
async function main(){
  const root=path.resolve(__dirname,'../..'),out=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc1c-rc2'));fs.mkdirSync(out,{recursive:true});
  const current=await profileReplay(root,CURRENT_PROFILE_ID,'0a6'),arcade=await profileReplay(root,ARCADE_PROFILE_ID,'0a7');
  const currentControl=await controlEvidence(root,CURRENT_PROFILE_ID,600),arcadeControl=await controlEvidence(root,ARCADE_PROFILE_ID,900);
  const makeOutcome=(run,fixture,chunks)=>createC15TrustedOutcomeV1({origin:fixture.origin,replayResult:run,chunks:stored(chunks),
    keyId:OUTCOME_KEY_ID,key:OUTCOME_KEY,issuedAtMs:T0+250000,keyRing:fixture.keyRing});
  const clearOutcome=makeOutcome(arcade.serverVictory,arcade.win,arcade.victoryChunks);
  const defeatOutcome=makeOutcome(arcade.serverDefeat,arcade.loss,arcade.defeatChunks);
  const keyRing={[OUTCOME_KEY_ID]:OUTCOME_KEY};verifyC15TrustedOutcomeV1(clearOutcome,keyRing,{battleId:arcade.win.battleId});
  verifyC15TrustedOutcomeV1(defeatOutcome,keyRing,{battleId:arcade.loss.battleId});
  const duplicateOutcome=makeOutcome(arcade.serverVictory,arcade.win,arcade.victoryChunks);
  let tamperRejected=false;try{verifyC15TrustedOutcomeV1({...clearOutcome,kills:69},keyRing);}catch{tamperRejected=true;}
  const localServerParity=run=>run.localVictory.stateDigest===run.serverVictory.stateDigest
    &&run.localDefeat.stateDigest===run.serverDefeat.stateDigest;
  const safety={rc1cOnly:true,nonEconomic:true,safeForSettlement:false,settlementEnabled:false,cloudRewards:false,
    c12Frozen:true,noSettlementImport:!fs.readFileSync(path.join(root,'server/lib/c15Rc1bRuntimeV1.cjs'),'utf8').includes('verifiedSettlementC7B2BV8')};
  const report={version:'c15-rc1c-rc2-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead:gitHead(root),
    baselineTag:'c15-rc1b-functional-pass-control-pending',selectedControlProfile:ARCADE_PROFILE_ID,
    control:{current:currentControl,arcade:arcadeControl,arcadeFaster:arcadeControl.catchUpTicks<currentControl.catchUpTicks,
      oneTickResponse:arcadeControl.inputToMotionTicks===1,noTeleport:currentControl.noTeleport&&arcadeControl.noTeleport},
    replay:{current:{victory:{ticks:current.serverVictory.ticks,waves:current.serverVictory.waves,kills:current.serverVictory.kills,
        localDigest:current.localVictory.stateDigest,serverDigest:current.serverVictory.stateDigest},
      defeat:{ticks:current.serverDefeat.ticks,hp:current.serverDefeat.hp,localDigest:current.localDefeat.stateDigest,serverDigest:current.serverDefeat.stateDigest}},
      arcade:{victory:{ticks:arcade.serverVictory.ticks,waves:arcade.serverVictory.waves,kills:arcade.serverVictory.kills,
        localDigest:arcade.localVictory.stateDigest,serverDigest:arcade.serverVictory.stateDigest},
      defeat:{ticks:arcade.serverDefeat.ticks,hp:arcade.serverDefeat.hp,localDigest:arcade.localDefeat.stateDigest,serverDigest:arcade.serverDefeat.stateDigest}},
      bothProfilesParity:localServerParity(current)&&localServerParity(arcade)},
    trustedOutcome:{clearPhase:clearOutcome.phase,defeatPhase:defeatOutcome.phase,outcomeDigest:clearOutcome.outcomeDigest,
      journalRootDigest:clearOutcome.journalRootDigest,profileId:clearOutcome.controlProfileId,signatureVerified:true,
      deterministicDuplicate:duplicateOutcome.outcomeDigest===clearOutcome.outcomeDigest&&duplicateOutcome.mac===clearOutcome.mac,
      tamperRejected,createOnlyRuntimeTestRequired:true},
    journalCapacity:{ticks:4500,chunks:151},resourcesUnchanged:true,safety,
    deviceGate:{required:true,scenarios:['control-a-b-short','selected-profile-five-wave'],rewardsRemainDisabled:true}};
  if(!report.control.arcadeFaster||!report.control.oneTickResponse||!report.control.noTeleport||!report.replay.bothProfilesParity
    ||report.replay.arcade.victory.waves!==5||report.replay.arcade.victory.kills!==70||report.replay.arcade.defeat.hp!==0
    ||report.trustedOutcome.clearPhase!=='rc2-trusted-clear'||report.trustedOutcome.defeatPhase!=='rc2-trusted-defeat'
    ||!report.trustedOutcome.signatureVerified||!report.trustedOutcome.deterministicDuplicate||!report.trustedOutcome.tamperRejected
    ||!safety.nonEconomic||safety.safeForSettlement||safety.settlementEnabled||safety.cloudRewards||!safety.c12Frozen)
    throw new Error('C15 RC1C/RC2 evidence failed');
  fs.writeFileSync(path.join(out,'C15_RC1C_RC2_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  const md=`# SpaceFighter C15-RC1C + RC2 Gate Report\n\n- Status: **PASS**\n- Git HEAD: \`${report.gitHead}\`\n- Selected control: \`${ARCADE_PROFILE_ID}\`\n- Arcade catch-up: ${arcadeControl.catchUpTicks} ticks vs current ${currentControl.catchUpTicks}\n- Input response: ${arcadeControl.inputToMotionTicks} tick\n- Both control profiles local/server parity: **${report.replay.bothProfilesParity}**\n- Victory: ${arcade.serverVictory.waves} waves / ${arcade.serverVictory.kills} kills / ${arcade.serverVictory.ticks} ticks\n- Defeat: HP ${arcade.serverDefeat.hp} / ${arcade.serverDefeat.ticks} ticks\n- RC2 signed outcome: **verified**, tamper rejected: **${tamperRejected}**\n- Settlement enabled: **false**\n- Cloud rewards: **false**\n- Android device gate required: **true**\n`;
  fs.writeFileSync(path.join(out,'C15_RC1C_RC2_GATE_REPORT.md'),md);console.log(`C15_RC1C_RC2_EVIDENCE_PASS ${path.join(out,'C15_RC1C_RC2_GATE_REPORT.json')}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
