'use strict';
/**
 * V2C.14-B OFFLINE, READ-ONLY audit. The pointer capture is client-reported;
 * even a valid projection is NOT a server ticket, fixed-tick replay, trusted
 * loadout, device attestation, or an entitlement to rewards.
 * No network, Firestore, writes, or session/profile identifiers.
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { validateClientTrace } = require('./c15DungeonApkTraceParityV2C11.cjs');
const VERSION = 'c15-dungeon-apk-input-bundle-v2c14b';
const JOURNAL_VERSION = 'c15-dungeon-apk-accepted-input-v2c14b';
const BUNDLE_FIELDS = ['version','source','dungeonId','roomId','qaOnly','trace',
  'inputJournal','safeForSettlement','rewardSettlementEnabled','cloudRewards',
  'liveApkParityVerified','serverReportLinked','checksumAlgorithm','checksum'];
const INPUT_FIELDS = ['version','source','sceneSeed','seedSource','tickBasis',
  'pointerEvents','frameMarkers','gestureCount','completedGestures','pointerActive',
  'pointerOverflow','frameOverflow','captureError','finished',
  'keyboardInputCovered','skillInputCovered','serverTicketVerified',
  'serverReadLoadoutVerified','independentReplayVerified','fullTickJournalVerified',
  'safeForSettlement','rewardSettlementEnabled','cloudRewards'];
const DOWN = ['kind','pointerId','atMs','clientX','clientY','position'];
const MOVE = [...DOWN,'viewport','delta'];
const UP = ['kind','pointerId','atMs','position'];
const VIEWPORT = ['canvasWidth','canvasHeight','aspect','halfHeight','inset','pointerSpeedMultiplier'];
const DELTA = ['deltaX','deltaY'];
const P = ['x','z'];
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const exact = (x, ks) => plain(x) && Object.keys(x).length === ks.length &&
  ks.every(k=>Object.hasOwn(x,k));
const numeric = x => typeof x === 'number' && Number.isFinite(x);
const bound = (x,lo,hi) => numeric(x) && x >= lo && x <= hi;
const point = x => exact(x,P) && bound(x.x,-100,100) && bound(x.z,-100,100);
const int = (x,a,b) => Number.isSafeInteger(x) && x >= a && x <= b;
const near = (a,b,eps=0.000001) => Math.abs(a-b) <= eps;
const four = x => Math.round(x*10000)/10000;
const fail = code => { const e = new TypeError(code); e.code=code; throw e; };
const freeze = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) {
  for (const v of Object.values(x)) freeze(v); Object.freeze(x);
} return x; };
function checksum(text) {
  let h=2166136261;
  for(let i=0;i<text.length;i++) h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
async function auditDungeonApkInputBundleV2C14B(bundle) {
  if (!exact(bundle,BUNDLE_FIELDS) || bundle.version !== VERSION ||
      bundle.source !== 'qa-local-apk-input-bundle-untrusted' ||
      bundle.dungeonId !== 'dung_taurus' || bundle.roomId !== 'taurus_entry' ||
      bundle.qaOnly !== true || bundle.safeForSettlement !== false ||
      bundle.rewardSettlementEnabled !== false || bundle.cloudRewards !== false ||
      bundle.liveApkParityVerified !== false || bundle.serverReportLinked !== false ||
      bundle.checksumAlgorithm !== 'fnv1a32-accidental-corruption-only' ||
      typeof bundle.checksum !== 'string' || !/^[0-9a-f]{8}$/.test(bundle.checksum)) {
    fail('V2C14B_BUNDLE_UNSAFE_OR_INVALID');
  }
  const {checksum:given,...body} = bundle;
  if(checksum(JSON.stringify(body))!==given) fail('V2C14B_BUNDLE_CHECKSUM_MISMATCH');
  validateClientTrace(bundle.trace);
  const t=bundle.trace, j=bundle.inputJournal;
  if (!exact(j,INPUT_FIELDS) || j.version !== JOURNAL_VERSION ||
      j.source !== 'accepted-ship-input-controller-untrusted' ||
      j.sceneSeed !== t.sceneSeed || j.seedSource !== t.seedSource ||
      j.tickBasis !== 'dom-event-time-plus-babylon-variable-frame-NOT-server-fixed' ||
      !Array.isArray(j.pointerEvents) || j.pointerEvents.length>256 ||
      !Array.isArray(j.frameMarkers) || j.frameMarkers.length!==t.frames.length ||
      !int(j.gestureCount,0,256) || !int(j.completedGestures,0,j.gestureCount) ||
      typeof j.pointerActive !== 'boolean' || typeof j.pointerOverflow !== 'boolean' ||
      typeof j.frameOverflow !== 'boolean' ||
      !(j.captureError === null || typeof j.captureError === 'string') ||
      typeof j.finished !== 'boolean' ||
      j.keyboardInputCovered !== false || j.skillInputCovered !== false ||
      j.serverTicketVerified !== false || j.serverReadLoadoutVerified !== false ||
      j.independentReplayVerified !== false || j.fullTickJournalVerified !== false ||
      j.safeForSettlement !== false || j.rewardSettlementEnabled !== false ||
      j.cloudRewards !== false) fail('V2C14B_JOURNAL_UNSAFE_OR_INVALID');
  for(const [i,m] of j.frameMarkers.entries()) {
    const f=t.frames[i];
    if(!exact(m,['frameSeq','simTick','player']) || m.frameSeq!==f.frameSeq ||
       m.simTick!==f.simTick || !point(m.player) ||
       m.player.x!==f.player.x || m.player.z!==f.player.z)
      fail('V2C14B_FRAME_LINK_MISMATCH');
  }
  // Use EXACT live movement formula (client's reviewed V2B.1 module) for
  // local diagnostic only. No server fixed-tick or ticket promotion.
  const movement=await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js')).href);
  let active=null, priorAt=-1, priorX=null, priorY=null, pose=null;
  let gestures=0,completed=0,moves=0,projectionDisagreements=0;
  for(const e of j.pointerEvents){
    if(!plain(e)||!int(e.pointerId,0,2147483647)||
      !bound(e.atMs,0,Number.MAX_SAFE_INTEGER)||e.atMs<priorAt||!point(e.position))
      fail('V2C14B_POINTER_INVALID');
    priorAt=e.atMs;
    if(e.kind==='down') {
      if(!exact(e,DOWN)||active!==null||!bound(e.clientX,-20000,20000)||
        !bound(e.clientY,-20000,20000)) fail('V2C14B_POINTER_SEQUENCE');
      active=e.pointerId;priorX=e.clientX;priorY=e.clientY;pose=e.position;gestures++;
    } else if(e.kind==='move') {
      if(!exact(e,MOVE)||active!==e.pointerId||!bound(e.clientX,-20000,20000)||
        !bound(e.clientY,-20000,20000)||!exact(e.viewport,VIEWPORT)||
        !exact(e.delta,DELTA)||!bound(e.delta.deltaX,-20000,20000)||
        !bound(e.delta.deltaY,-20000,20000)||
        !near(e.clientX-priorX,e.delta.deltaX)||
        !near(e.clientY-priorY,e.delta.deltaY)) fail('V2C14B_POINTER_SEQUENCE');
      try {
        const predicted=movement.projectDungeonDirectTouchV2B1({
          position:pose,viewport:e.viewport,delta:e.delta});
        if(!near(predicted.x,e.position.x)||!near(predicted.z,e.position.z))
          projectionDisagreements++;
      } catch(_) { projectionDisagreements++; }
      moves++;pose=e.position;priorX=e.clientX;priorY=e.clientY;
    } else if(e.kind==='up') {
      if(!exact(e,UP)||active!==e.pointerId) fail('V2C14B_POINTER_SEQUENCE');
      if(!near(e.position.x,pose.x)||!near(e.position.z,pose.z))
        projectionDisagreements++;
      active=null;completed++;
    } else fail('V2C14B_POINTER_INVALID');
  }
  if(gestures!==j.gestureCount||completed!==j.completedGestures||
    (active!==null)!==j.pointerActive) fail('V2C14B_GESTURE_COUNTER_MISMATCH');
  const captureComplete=t.frames.length>0&&!t.truncated&&j.pointerOverflow===false&&
    j.frameOverflow===false&&j.captureError===null&&moves>0&&
    gestures>0&&completed===gestures&&active===null&&projectionDisagreements===0;
  const notes=[
    'QA accepted DOM pointer events; no device attestation or authenticated session.',
    'Babylon frame observations are NOT a 60Hz input journal.',
    'No matching V2B.2 server-signed ticket or V2C.9 server-read loadout.',
    'Keyboard, skill and full replay input coverage are not established.',
    'Local FNV checksum only detects accidental corruption, not forgery.',
  ];
  return freeze({version:VERSION,status:'CLIENT_INPUT_OBSERVED_UNPAIRED',
    frames:t.frames.length,acceptedPointerEvents:j.pointerEvents.length,
    acceptedPointerMoves:moves,closedGestures:completed,
    pointerProjectionDisagreements:projectionDisagreements,
    localCaptureComplete:captureComplete,
    serverTicketVerified:false,serverReadLoadoutVerified:false,
    deviceAttested:false,fixedTickJournalEquivalent:false,
    independentReplayVerified:false,trueApkServerParity:'NOT_VERIFIED',
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    notes});
}
module.exports = Object.freeze({VERSION,JOURNAL_VERSION,
  auditDungeonApkInputBundleV2C14B});
