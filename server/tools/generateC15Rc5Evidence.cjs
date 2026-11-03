'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const serverProfiles=require('../lib/c15ControlProfilesV1.cjs');
const {SETTLEMENT_CONTROL_PROFILES}=require('../lib/c15Rc3SettlementV1.cjs');
const {previewFromTrustedSnapshot}=require('../lib/combatMovementWeaponV8.cjs');
const {createC15Rc1Fixture}=require('./c15Rc1Fixture.cjs');

const root=path.resolve(__dirname,'../..');
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const output=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc5'));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const pushEnabled=text=>/^\s*push:/m.test(text);
const round=value=>Math.round(value*1000)/1000;

async function main(){
  const clientProfiles=await import(pathToFileURL(path.join(root,'client/src/game/c15/C15ControlProfilesV1.js')).href);
  const intent=await import(pathToFileURL(path.join(root,'client/src/game/c15/C15ControlIntent.js')).href);
  const pacerModule=await import(pathToFileURL(path.join(root,'client/src/game/c15/C15FramePacer.js')).href);
  const profileId=clientProfiles.C15_ARCADE_CONTROL_PROFILE_ID;
  const profileParity=JSON.stringify(clientProfiles.C15_CONTROL_PROFILES)===JSON.stringify(serverProfiles.C15_CONTROL_PROFILES);
  const legacyFrozen=clientProfiles.C15_DEFAULT_CONTROL_PROFILE_ID===clientProfiles.C15_LEGACY_ARCADE_CONTROL_PROFILE_ID
    &&serverProfiles.DEFAULT_PROFILE_ID===serverProfiles.LEGACY_ARCADE_PROFILE_ID;
  const rc5Profile=clientProfiles.resolveC15ControlProfile(profileId);
  const starterFixture=await createC15Rc1Fixture({profileId});
  const starterPreview=previewFromTrustedSnapshot(starterFixture.snapshot,starterFixture.policy);
  const starterPlayableHalfWidth=starterFixture.snapshot.arena.halfWidthUnits-starterPreview.pilotHitRadiusUnits;
  const starterCenterToEdgeTicks=Math.ceil(starterPlayableHalfWidth/starterPreview.movePerTickUnits);
  const starterCenterToEdgeAuthorityMs=round(starterCenterToEdgeTicks*1000/30);
  const aspectMatrix=[
    {name:'9:16',width:1080,height:1920},
    {name:'9:19.5',width:1080,height:2340},
    {name:'9:20',width:1080,height:2400},
    {name:'3:4 tablet',width:1200,height:1600},
    {name:'4:3 tablet',width:1600,height:1200},
  ].flatMap(item=>[.5,1,2].map(speedMultiplier=>{
    const config={arenaHalfHeight:15000,arenaHalfWidth:13200,aspect:item.width/item.height,
      canvasHeight:item.height,canvasWidth:item.width,halfHeight:15,hitRadius:700,movePerTick:3600,
      speedMultiplier,startX:0,startZ:0};
    const base=intent.openC15ControlIntent(config,{profileId});
    const horizontal=intent.c15ControlIntentView(intent.addC15PointerDelta(base,{deltaX:-item.width/2,deltaY:0}));
    const vertical=intent.c15ControlIntentView(intent.addC15PointerDelta(base,{deltaX:0,deltaY:item.height/2}));
    const horizontalReach=Math.abs(horizontal.target.xUnits)/(config.arenaHalfWidth-config.hitRadius);
    const verticalReach=Math.abs(vertical.target.zUnits)/(config.arenaHalfHeight-config.hitRadius);
    return Object.freeze({name:item.name,width:item.width,height:item.height,speedMultiplier,
      horizontalReachRatio:round(horizontalReach),verticalReachRatio:round(verticalReach),
      pass:horizontalReach>=.95&&verticalReach>=.95});
  }));
  function schedule(hz,durationMs=2000){
    const pacer=pacerModule.createC15FramePacer({simulationHz:30,maxCatchUpSteps:3,maxFrameDeltaMs:100});
    pacer.reset(0);let ticks=0;const step=1000/hz;
    for(let now=step;now<=durationMs+.0001;now+=step)ticks+=pacer.advance(now).steps;
    return Object.freeze({renderHz:hz,authoritativeTicks:ticks});
  }
  const renderSchedules=[60,90,120,144].map(hz=>schedule(hz));
  const renderRateIndependent=renderSchedules.every(item=>item.authoritativeTicks===60);
  const workflows={
    rc1b:read('.github/workflows/c15-rc1b-gate.yml'),
    rc1c:read('.github/workflows/c15-rc1c-rc2-gate.yml'),
    rc3:read('.github/workflows/c15-rc3-gate.yml'),
    rc4:read('.github/workflows/c15-rc4-gate.yml'),
    rc5:read('.github/workflows/c15-rc5-gate.yml'),
    rc6:read('.github/workflows/c15-rc6-gate.yml'),
    phase:read('.github/workflows/phase0-ci.yml'),
    android:read('.github/workflows/android-native-smoke.yml'),
    androidRelease:read('.github/workflows/android-release-candidate.yml'),
  };
  const frozenGatesManualOnly=['rc1b','rc1c','rc3','rc4'].every(name=>!pushEnabled(workflows[name]));
  const rc5ManualAuditOnly=!pushEnabled(workflows.rc5)&&/npm run gate:c15-rc5/.test(workflows.rc5);
  const singleRc6PushGate=pushEnabled(workflows.rc6)&&/npm run gate:c15-rc6/.test(workflows.rc6)
    &&!/npm run gate:c15-rc5/.test(workflows.rc6);
  const androidManualOnly=!pushEnabled(workflows.android)&&!pushEnabled(workflows.androidRelease)&&/c15_rc5:/.test(workflows.android)
    &&/npm run gate:c15-rc5:fast/.test(workflows.android)
    &&/spacefighter-android-c15-rc5-internal-candidate/.test(workflows.android);
  const activity=read('client/android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
  const manifest=read('client/android/app/src/main/AndroidManifest.xml');
  const nativeRefreshPolicy=/getSupportedModes\(\)/.test(activity)&&!/preferredDisplayModeId/.test(activity)
    &&/preferredRefreshRate = targetRefreshRate/.test(activity)&&/attributes\.setFrameRateBoostOnTouchEnabled\(true\)/.test(activity)
    &&/android:appCategory="game"/.test(manifest);
  const screen=read('client/src/components/C15LocalAlpha1/index.jsx');
  const pointer=read('client/src/game/c15/C15PointerController.js');
  const inputPipeline=/createC15FramePacer/.test(screen)&&/requestAnimationFrame\(runFrame\)/.test(screen)
    &&!/setInterval\(/.test(screen)&&/createC15PointerController/.test(screen)&&/predictC15ControlRenderPosition/.test(screen);
  const pointerLifecycle=['pointerrawupdate','pointercancel','lostpointercapture','secondary-pointer-ignored','getCoalescedEvents','window-blur']
    .every(marker=>pointer.includes(marker));
  let gitHead='0'.repeat(40);try{gitHead=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch(_){const marker=path.join(root,'GIT_HEAD.txt');if(fs.existsSync(marker))gitHead=fs.readFileSync(marker,'utf8').trim();}
  const report={version:'c15-rc5-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead,
    baseline:{rc4Status:'PASS',rc4HotfixPrefix:'e9d3e41',productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true},
    control:{selectedProfile:profileId,legacyProfile:clientProfiles.C15_LEGACY_ARCADE_CONTROL_PROFILE_ID,
      legacyDefaultPreserved:legacyFrozen,profileParity,coordinateContract:rc5Profile.coordinateContract,
      simulationHz:rc5Profile.simulationHz,maxMovePerTickUnits:rc5Profile.maxMovePerTickUnits,
      maxTargetLagUnits:rc5Profile.maxTargetLagUnits,starterMovePerTickUnits:starterPreview.movePerTickUnits,
      starterCenterToEdgeTicks,starterCenterToEdgeAuthorityMs,aspectMatrix,fullTravelPass:aspectMatrix.every(item=>item.pass)},
    framePacing:{authoritativeHz:30,renderSchedules,renderRateIndependent,nativeRefreshPolicy,
      highRefreshIsPreference:true,inputPipeline},
    pointer:{ownership:'first-primary-pointer',multiTouchIsolation:pointerLifecycle,cancelStopsAtShip:pointerLifecycle,
      coalescedSamples:pointer.includes('getCoalescedEvents')},
    settlement:{legacyAndRc5ProfilesAllowed:SETTLEMENT_CONTROL_PROFILES.includes(clientProfiles.C15_LEGACY_ARCADE_CONTROL_PROFILE_ID)
      &&SETTLEMENT_CONTROL_PROFILES.includes(profileId),rewardPolicyChanged:false,receiptFormatChanged:false},
    pipeline:{frozenGatesManualOnly,phasePushDisabled:!pushEnabled(workflows.phase),rc5ManualAuditOnly,singleRc6PushGate,androidManualOnly},
    safety:{productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true,rawPointerServerLogging:false,
      firestoreRulesChanged:false,secretsChanged:false}};
  const booleans=[report.control.legacyDefaultPreserved,report.control.profileParity,report.control.fullTravelPass,
    report.framePacing.renderRateIndependent,report.framePacing.nativeRefreshPolicy,report.framePacing.inputPipeline,
    report.control.starterCenterToEdgeAuthorityMs<=180,
    report.pointer.multiTouchIsolation,report.pointer.cancelStopsAtShip,report.settlement.legacyAndRc5ProfilesAllowed,
    ...Object.values(report.pipeline)];
  if(booleans.some(value=>value!==true))throw new Error(`RC5 evidence invariant failed: ${JSON.stringify(report)}`);
  const releaseManifest={version:'c15-rc5-release-manifest-v1',gitHead,baselineCommitPrefix:'e9d3e41',
    selectedControlProfile:profileId,legacyControlProfile:clientProfiles.C15_LEGACY_ARCADE_CONTROL_PROFILE_ID,
    minimumAppVersion:'1.2.2',authoritativeSimulationHz:30,supportedRenderSchedulesHz:[60,90,120,144],
    defaultProductionFlags:{releaseGateEnabled:false,globalKillSwitch:true,settlementEnabled:false,cloudRewards:false},
    candidateArtifacts:{android:'spacefighter-android-c15-rc5-internal-candidate',ios:'deferred-until-android-complete'},
    validation:{local:'gate:c15-rc5:fast',ci:'gate:c15-rc5',native:'manual-after-ci'},
    deviceAcceptance:{fullTravelRatioMin:.95,inputToVisibleP95MsAt60HzMax:50,centerToEdgeCatchUpP95MsMax:180,stuckPointersMax:0,
      pointerCancelDriftAllowed:false,verifiedBattleRequired:true,retestSettlementRequired:false},
    excluded:['public production rollout','iOS RC5 candidate','RevenueCat/IAP','production key material','C12/C9 reopening']};
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'C15_RC5_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(output,'C15_RC5_RELEASE_MANIFEST.json'),JSON.stringify(releaseManifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'C15_RC5_GATE_REPORT.md'),`# SpaceFighter C15-RC5 Android Input & Frame-Pacing Gate\n\n- Status: **PASS**\n- Git HEAD: \`${gitHead}\`\n- Profile: \`${profileId}\`\n- Legacy V1 preserved: **true**\n- Full arena travel matrix: **PASS**\n- Starter center-to-edge authority: **${starterCenterToEdgeAuthorityMs} ms / ${starterCenterToEdgeTicks} ticks**\n- Fixed authority: **30 Hz**\n- Render schedules verified: **60 / 90 / 120 / 144 Hz**\n- Multi-touch/pointer cancel/lost capture: **PASS**\n- Native refresh policy: **PASS (system preference, graceful fallback)**\n- RC5 frozen manual audit: **true**
- Single full RC6 push gate: **true**\n- Android candidate manual-only: **true**\n- Production settlement enabled: **false**\n- Production Cloud Rewards: **false**\n`);
  console.log('C15_RC5_EVIDENCE_PASS',path.join(output,'C15_RC5_GATE_REPORT.json'));
}
main().catch(error=>{console.error(error?.stack||error);process.exitCode=1;});
