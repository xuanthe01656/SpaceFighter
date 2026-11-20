'use strict';
/**
 * Dungeon V2C.11: OFFLINE/READ-ONLY comparison of actual Babylon QA frame
 * observations against separately produced V2C.10 server candidate reports.
 * NO server auth, remote IO, HTTP route or settlement. JSON is untrusted.
 * Matching two traces is NOT APK integrity, independent replay or victory.
 */
const VERSION='c15-dungeon-apk-parity-v2c11';
const TRACE_VERSION='c15-dungeon-apk-trace-v2c11';
const REPORT_VERSION='c15-dungeon-integrated-combat-v2c10';
const MAX_FRAMES=720,MAX_REPORTS=360,MAX_EVENTS=512;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const int=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const point=x=>plain(x)&&finite(x.x)&&finite(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const validId=x=>typeof x==='string'&&x.length>=1&&x.length<=128&&
  /^[A-Za-z0-9_:./@\-]+$/.test(x);
const eq=(obj,keys)=>plain(obj)&&Object.keys(obj).length===keys.length&&
  keys.every(k=>Object.hasOwn(obj,k));
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);
}return x;};
function checksum(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
const fail=code=>{const e=new TypeError(code);e.code=code;throw e;};
function validateClientTrace(trace){
  const keys=['version','source','dungeonId','roomId','sceneSeed','seedSource',
    'tickBasis','frames','events','finished','truncated','error',
    'safeForSettlement','rewardSettlementEnabled','cloudRewards',
    'liveApkParityVerified','checksum'];
  if(!eq(trace,keys)||trace.version!==TRACE_VERSION||
    trace.source!=='qa-babylon-observer-untrusted'||
    trace.dungeonId!=='dung_taurus'||trace.roomId!=='taurus_entry'||
    !int(trace.sceneSeed,1,0xffffffff)||
    !['server-ticket-local-unverified','local-client-seed'].includes(trace.seedSource)||
    trace.tickBasis!=='frameScale-delta-not-fixed-tick'||
    trace.safeForSettlement!==false||trace.rewardSettlementEnabled!==false||
    trace.cloudRewards!==false||trace.liveApkParityVerified!==false||
    typeof trace.finished!=='boolean'||trace.truncated!==false||
    trace.error!==null||!Array.isArray(trace.frames)||
    trace.frames.length<1||trace.frames.length>MAX_FRAMES||
    !Array.isArray(trace.events)||trace.events.length>MAX_EVENTS||
    !/^[a-f0-9]{8}$/.test(trace.checksum))fail('V2C11_UNTRUSTED_OR_TRUNCATED_TRACE');
  const {checksum:given,...payload}=trace;
  if(checksum(JSON.stringify(payload))!==given)fail('V2C11_TRACE_CHECKSUM_MISMATCH');
  let lastTick=-1;
  for(const [i,frame] of trace.frames.entries()){
    if(!eq(frame,['frameSeq','simTick','dtMs','roomId','player','playerHp',
      'playerShieldHp','enemies','projectiles','bossActive','bossHp'])||
      frame.frameSeq!==i+1||!finite(frame.simTick)||
      frame.simTick<=lastTick||frame.simTick<0||
      !finite(frame.dtMs)||frame.dtMs<0||frame.dtMs>250||
      frame.roomId!=='taurus_entry'||!point(frame.player)||
      !finite(frame.playerHp)||frame.playerHp<0||
      !finite(frame.playerShieldHp)||frame.playerShieldHp<0||
      !Array.isArray(frame.enemies)||frame.enemies.length>32||
      !eq(frame.projectiles,['player','hostile'])||
      !int(frame.projectiles.player,0,9999)||!int(frame.projectiles.hostile,0,9999)||
      typeof frame.bossActive!=='boolean'||
      !finite(frame.bossHp)||frame.bossHp<0)fail('V2C11_INVALID_FRAME');
    const ids=new Set();
    for(const enemy of frame.enemies){
      if(!eq(enemy,['id','position','hp','maxHp'])||!validId(enemy.id)||
        ids.has(enemy.id)||!point(enemy.position)||
        !finite(enemy.hp)||!finite(enemy.maxHp)||enemy.hp<0||
        enemy.maxHp<=0||enemy.hp>enemy.maxHp*2)
        fail('V2C11_INVALID_ENEMY');
      ids.add(enemy.id);
    }
    lastTick=frame.simTick;
  }
  for(const event of trace.events){
    if(!eq(event,['kind','simTick','id','position','velocity','count'])||
      !['enemy_fire','enemy_death','player_salvo_plan'].includes(event.kind)||
      !finite(event.simTick)||event.simTick<0||
      event.simTick>lastTick+1||
      (event.id!==null&&!validId(event.id))||
      (event.position!==null&&!point(event.position))||
      (event.velocity!==null&&!point(event.velocity))||
      !int(event.count,1,32))fail('V2C11_INVALID_EVENT');
  }
  return true;
}
function validateServerReport(report,seed,previous){
  if(!plain(report)||report.version!==REPORT_VERSION||
    report.dungeonId!=='dung_taurus'||report.roomId!=='taurus_entry'||
    report.sceneSeed!==seed||!int(report.simulatedTicks,1,360)||
    (previous&&report.simulatedTicks<=previous.simulatedTicks)||
    !point(report.candidatePlayerPosition)||
    !finite(report.candidatePlayerHp)||report.candidatePlayerHp<0||
    !finite(report.candidatePlayerShieldHp)||report.candidatePlayerShieldHp<0||
    !Array.isArray(report.candidateEnemyHp)||report.candidateEnemyHp.length>32||
    typeof report.candidateDigest!=='string'||
    !/^[0-9a-f]{64}$/.test(report.candidateDigest)||
    report.inputPositionsAppliedPerTick!==true||
    report.serverReadLoadoutAppliedToWeaponAndVitals!==true||
    report.safeForSettlement!==false||report.rewardSettlementEnabled!==false||
    report.cloudRewards!==false||report.independentReplayVerified!==false||
    report.dungeonVictoryVerified!==false||report.liveGameplayAiParityVerified!==false)
    fail('V2C11_INVALID_SERVER_CANDIDATE_REPORT');
  const seen=new Set();
  for(const e of report.candidateEnemyHp){
    if(!plain(e)||!validId(e.id)||seen.has(e.id)||
      !finite(e.hp)||e.hp<0||!finite(e.maxHp)||e.maxHp<=0||
      typeof e.dead!=='boolean'||(e.dead&&e.hp>0))
      fail('V2C11_INVALID_SERVER_ENEMY_HP');
    seen.add(e.id);
  }
}
function compareDungeonApkTraceV2C11({clientTrace,serverReports=[]}={}){
  validateClientTrace(clientTrace);
  if(!Array.isArray(serverReports)||serverReports.length>MAX_REPORTS)
    fail('V2C11_REPORTS_INVALID');
  const common={version:VERSION,qaOnly:true,clientFrames:clientTrace.frames.length,
    clientEvents:clientTrace.events.length,clientComplete:clientTrace.finished,
    sceneSeed:clientTrace.sceneSeed,
    clock:'babylon-variable-frame-versus-60hz-qa-fixed',
    apkDeviceIntegrityVerified:false,serverReportProvenanceVerified:false,
    fullCombatParityVerified:false,independentReplayVerified:false,
    dungeonVictoryVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false};
  if(serverReports.length===0)
    return freeze({...common,status:'CLIENT_EVIDENCE_UNPAIRED',aligned:0,
      uncheckedFrames:clientTrace.frames.length,divergences:[],
      notes:['No independent V2C.10 report was supplied. Not a parity result.']});
  let previous=null;
  for(const report of serverReports){
    validateServerReport(report,clientTrace.sceneSeed,previous);previous=report;
  }
  const byTick=new Map(serverReports.map(r=>[r.simulatedTicks,r]));
  const differences=[],matched=[];
  const MAX_DIFFERENCES=32;
  let unchecked=0,unmatchedEnemySamples=0;
  for(const frame of clientTrace.frames){
    // It is unsafe to snap fractional Babylon ticks to nearest server tick.
    const rounded=Math.round(frame.simTick);
    if(Math.abs(frame.simTick-rounded)>.001){unchecked++;continue;}
    const report=byTick.get(rounded);
    if(!report){unchecked++;continue;}
    matched.push(rounded);
    const put=(field,actual,candidate)=>{
      if(differences.length<MAX_DIFFERENCES)
        differences.push({tick:rounded,field,client:actual,candidate});
    };
    if(Math.abs(frame.player.x-report.candidatePlayerPosition.x)>.075||
       Math.abs(frame.player.z-report.candidatePlayerPosition.z)>.075)
      put('playerPosition',frame.player,report.candidatePlayerPosition);
    if(Math.abs(frame.playerHp-report.candidatePlayerHp)>.5)
      put('playerHp',frame.playerHp,report.candidatePlayerHp);
    if(Math.abs(frame.playerShieldHp-report.candidatePlayerShieldHp)>.5)
      put('playerShieldHp',frame.playerShieldHp,report.candidatePlayerShieldHp);
    const clientById=new Map(frame.enemies.map(e=>[e.id,e]));
    for(const enemy of report.candidateEnemyHp){
      const live=clientById.get(enemy.id);
      // Candidate HP roster also includes unspawned/dead actors. Absence
      // alone is NOT proof of a mismatch or victory.
      if(!live){unmatchedEnemySamples++;continue;}
      if(Math.abs(live.hp-enemy.hp)>.5)
        put('enemyHp:'+enemy.id,live.hp,enemy.hp);
    }
  }
  const unique=new Set(matched).size;
  let status='NO_EXACT_TICK_ALIGNMENT';
  if(unique>0&&differences.length)status='CANDIDATE_DIVERGENCE_OBSERVED';
  else if(unique>0)status='CANDIDATE_SAMPLES_AGREE_UNTRUSTED';
  return freeze({...common,status,aligned:unique,uncheckedFrames:unchecked,
    unmatchedEnemySamples,divergences:differences,
    notes:[
      'Matching or diverging samples are diagnostic, not cryptographic proof.',
      clientTrace.seedSource==='local-client-seed'
        ? 'Client used local seed: no server-issued ticket provenance verified.'
        : 'Client ticket provenance is a local claim; no device attestation.',
      'Real Babylon frame time, projected muzzle and candidate 60 Hz timing differ.',
    ]});
}
module.exports=freeze({VERSION,TRACE_VERSION,validateClientTrace,
  compareDungeonApkTraceV2C11});
