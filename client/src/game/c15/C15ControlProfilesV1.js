/** Shared client mirror of the server-selected C15 control profiles. */
import {sha256Hex} from '../../generated/c15-kernel/C15KernelHash.js';

export const C15_CONTROL_PROFILE_VERSION='c15-control-profiles-v1';
export const C15_CONTROL_PROFILE_V2_VERSION='c15-control-profiles-v2';
export const C15_CURRENT_CONTROL_PROFILE_ID='current-balanced-v1';
export const C15_LEGACY_ARCADE_CONTROL_PROFILE_ID='arcade-responsive-v1';
export const C15_ARCADE_CONTROL_PROFILE_ID='arcade-responsive-v2';
export const C15_DEFAULT_CONTROL_PROFILE_ID=C15_LEGACY_ARCADE_CONTROL_PROFILE_ID;

const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const freeze=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x);}return x;};
const digest=value=>sha256Hex(JSON.stringify(['sf-c15-control-profile',canonical(value)]));
const LEGACY_BASE=Object.freeze({pilotHitRadiusUnits:700,projectileHitRadiusUnits:200,
  pointerTargetScalePermille:1000,maxTargetLagUnits:13200});

// Existing V1 objects are intentionally byte-stable so old origins, outcomes,
// receipts and replay evidence remain valid. RC5 adds a separate V2 profile.
const RAW=Object.freeze({
  [C15_CURRENT_CONTROL_PROFILE_ID]:Object.freeze({version:C15_CONTROL_PROFILE_VERSION,id:C15_CURRENT_CONTROL_PROFILE_ID,
    policyVersion:'v8c6b-pierce-burst-preview-v3',keyboardUnitsPer60HzFrame:.3,
    releasePolicy:'stop-at-ship',renderFollowMs:24,deadZonePermille:500,
    ...LEGACY_BASE,commercialRc1c:true}),
  [C15_LEGACY_ARCADE_CONTROL_PROFILE_ID]:Object.freeze({version:C15_CONTROL_PROFILE_VERSION,id:C15_LEGACY_ARCADE_CONTROL_PROFILE_ID,
    policyVersion:'v8c6b-pierce-burst-preview-v4-arcade',keyboardUnitsPer60HzFrame:.45,
    releasePolicy:'retain-target',renderFollowMs:10,deadZonePermille:350,
    ...LEGACY_BASE,commercialRc1c:true}),
  [C15_ARCADE_CONTROL_PROFILE_ID]:Object.freeze({version:C15_CONTROL_PROFILE_V2_VERSION,id:C15_ARCADE_CONTROL_PROFILE_ID,
    policyVersion:'v8c6b-pierce-burst-preview-v5-arcade-rc5',keyboardUnitsPer60HzFrame:1.5,
    releasePolicy:'retain-target',cancelPolicy:'stop-at-ship',renderFollowMs:4,deadZonePermille:180,
    pilotHitRadiusUnits:700,projectileHitRadiusUnits:200,pointerTargetScalePermille:1000,
    maxTargetLagUnits:40000,maxMovePerTickUnits:3600,coordinateContract:'arena-relative-v2',edgeCompensationPermille:1050,
    renderPredictionLeadPermille:500,simulationHz:30,commercialRc1c:true,commercialRc5:true}),
});

export const C15_CONTROL_PROFILES=freeze(Object.fromEntries(Object.entries(RAW)
  .map(([id,value])=>[id,{...value,profileDigest:digest(value)}])));

export function resolveC15ControlProfile(id=C15_DEFAULT_CONTROL_PROFILE_ID){
  const value=C15_CONTROL_PROFILES[id];if(!value)throw new TypeError(`C15 unsupported control profile: ${id}`);return value;
}
export function resolveC15ControlProfileForPolicy(policy){
  if(!record(policy)||typeof policy.version!=='string'||typeof policy.keyboardUnitsPer60HzFrame!=='number')
    throw new TypeError('C15 control policy invalid');
  const value=Object.values(C15_CONTROL_PROFILES).find(profile=>profile.policyVersion===policy.version
    &&profile.keyboardUnitsPer60HzFrame===policy.keyboardUnitsPer60HzFrame
    &&profile.pilotHitRadiusUnits===policy.pilotHitRadiusUnits
    &&profile.projectileHitRadiusUnits===policy.projectileHitRadiusUnits);
  if(!value)throw new TypeError('C15 control policy is not registered');return value;
}
