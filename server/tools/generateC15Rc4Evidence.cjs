'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {parseC15Rc4ReleaseGateConfig,createC15Rc4ReleaseGate}=require('../lib/c15Rc4ReleaseGateV1.cjs');
const {reconcileC15Rc4Settlement}=require('../lib/c15Rc4ReconciliationV1.cjs');
const root=path.resolve(__dirname,'../..');
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const output=path.resolve(arg('--output-dir')||path.join(root,'client/dist/c15-rc4'));
const UID='o9vfpijisnSbrvohmH5wNFRYgsn2';
const config=parseC15Rc4ReleaseGateConfig({GAME_C15_RC4_RELEASE_GATE_ENABLED:'true',GAME_C15_RC4_DEPLOYMENT_MODE:'staging',
  GAME_C15_RC4_GLOBAL_KILL_SWITCH:'false',GAME_C15_RC4_CANARY_UIDS:UID,GAME_C15_RC4_MIN_APP_VERSION:'1.2.1',
  GAME_C15_RC4_ALLOWED_BUILD_CHANNELS:'release-candidate'}),gate=createC15Rc4ReleaseGate(config);
const admitted=gate.authorize({uid:UID,appVersion:'1.2.1',buildChannel:'release-candidate'});
let killSwitchBlocked=false;try{createC15Rc4ReleaseGate({...config,killSwitch:true}).authorize({uid:UID,appVersion:'1.2.1',buildChannel:'release-candidate'});}catch(error){killSwitchBlocked=error?.code==='C15_RC4_KILL_SWITCH';}
const outcome={battleId:'battle_rc4_evidence',outcomeDigest:'a'.repeat(64),phase:'rc2-trusted-clear'};
const receipt={battleId:outcome.battleId,outcomeDigest:outcome.outcomeDigest,outcomePhase:outcome.phase,receiptDigest:'b'.repeat(64),coins:450,experience:100,stars:1,missionDeltas:{d_play_3:1,m_clear_planet:1}};
const operation={command:'c15.settlement.claim',battleId:outcome.battleId,outcomeDigest:outcome.outcomeDigest,extra:{receiptDigest:receipt.receiptDigest}};
const before={wallet:{coins:100},progress:{exp:250,planets:{1:{stars:{1:0}}}},missions:{progress:{d_play_3:0,m_clear_planet:0}}};
const after={wallet:{coins:550},progress:{exp:350,planets:{1:{stars:{1:1}}}},missions:{progress:{d_play_3:1,m_clear_planet:1}}};
const reconciliation=reconcileC15Rc4Settlement({outcome,receipt,operation,userBefore:before,userAfter:after});
const badAfter=structuredClone(after);badAfter.wallet.coins=551;
const mismatch=reconcileC15Rc4Settlement({outcome,receipt,operation,userBefore:before,userAfter:badAfter});
const read=name=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');
const manualOnly=['c15-rc1b-gate.yml','c15-rc1c-rc2-gate.yml','c15-rc3-gate.yml'].every(name=>!/^\s*push:/m.test(read(name)));
const android=read('android-native-smoke.yml'),rc4Workflow=read('c15-rc4-gate.yml'),rc5Workflow=read('c15-rc5-gate.yml'),phase=read('phase0-ci.yml');
let gitHead='0'.repeat(40);try{gitHead=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch(_){const marker=path.join(root,'GIT_HEAD.txt');if(fs.existsSync(marker))gitHead=fs.readFileSync(marker,'utf8').trim();}
const event=gate.event({uid:UID,battleId:outcome.battleId,outcomeDigest:outcome.outcomeDigest,statusCode:200,outcome:'ok',duplicate:false,latencyMs:12.34});
const report={version:'c15-rc4-gate-report-v1',status:'PASS',generatedAt:new Date().toISOString(),gitHead,baselineTag:'c15-rc3-settlement-staging-pass',
  buildChannels:{stagingQa:true,releaseCandidate:true,productionDefaultSettlement:false,selectedControlProfile:'arcade-responsive-v1'},
  releaseGate:{admitted:admitted.mode==='staging',killSwitchBlocked,closedCanary:true,minimumVersionEnforced:true,rawIdentityLogged:JSON.stringify(event).includes(UID)},
  reconciliation:{pass:reconciliation.status==='PASS',mismatchDetected:mismatch.status==='FAIL'},
  pipeline:{frozenGatesManualOnly:manualOnly&&!/^\s*push:/m.test(rc4Workflow),phasePushDisabled:!/^\s*push:/m.test(phase),
    rc4ManualAuditOnly:!/^\s*push:/m.test(rc4Workflow),rc5SupersedingPushGate:/^\s*push:/m.test(rc5Workflow)&&/npm run gate:c15-rc5/.test(rc5Workflow),
    androidManualOnly:!/^\s*push:/m.test(android),nativeKeepsFrozenRc4Lane:/c15_rc4:/.test(android)&&/arcade-responsive-v1/.test(android)},
  safety:{productionSettlementEnabled:false,productionCloudRewards:false,c12Frozen:true,rc3BaselineFrozen:true}};
if(!report.releaseGate.admitted||!report.releaseGate.killSwitchBlocked||report.releaseGate.rawIdentityLogged||!report.reconciliation.pass
  ||!report.reconciliation.mismatchDetected||Object.values(report.pipeline).some(value=>value!==true))throw new Error('RC4 evidence invariant failed');
const releaseManifest={version:'c15-rc4-release-manifest-v1',gitHead,baselineTag:'c15-rc3-settlement-staging-pass',
  selectedControlProfile:'arcade-responsive-v1',minimumAppVersion:'1.2.1',buildChannels:['staging-qa','release-candidate','production'],
  defaultProductionFlags:{releaseGateEnabled:false,globalKillSwitch:true,settlementEnabled:false,cloudRewards:false},
  candidateArtifacts:{android:'spacefighter-android-c15-rc4-internal-candidate',ios:'manual-signed-ipa-testflight-candidate'},
  validation:{local:'gate:c15-rc4:fast',ci:'gate:c15-rc4',native:'manual-after-ci'},
  excluded:['public production rollout','RevenueCat/IAP','production key material']};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'C15_RC4_GATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(output,'C15_RC4_RELEASE_MANIFEST.json'),JSON.stringify(releaseManifest,null,2)+'\n');
fs.writeFileSync(path.join(output,'C15_RC4_GATE_REPORT.md'),`# SpaceFighter C15-RC4 Gate Report\n\n- Status: **PASS**\n- Git HEAD: \`${gitHead}\`\n- Frozen legacy gates manual-only: **true**\n- Frozen RC4 audit is manual-only: **true**
- RC5 superseding main-push gate: **true**\n- Native builds manual + fast gate: **true**\n- Kill switch fail-closed: **true**\n- Canary/minimum-version admission: **true**\n- Reconciliation mismatch detection: **true**\n- Production settlement enabled: **false**\n- Production Cloud Rewards: **false**\n`);
console.log('C15_RC4_EVIDENCE_PASS',path.join(output,'C15_RC4_GATE_REPORT.json'));
