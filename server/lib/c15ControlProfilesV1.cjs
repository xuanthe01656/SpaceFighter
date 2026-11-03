'use strict';
/**
 * C15 deterministic control profiles.
 *
 * V1 profile objects stay byte-stable for historical origin/outcome/receipt
 * verification. RC5 adds arcade-responsive-v2 as the default for new battles.
 */
const {createHash}=require('node:crypto');
const VERSION='c15-control-profiles-v1';
const V2_VERSION='c15-control-profiles-v2';
const CURRENT_PROFILE_ID='current-balanced-v1';
const LEGACY_ARCADE_PROFILE_ID='arcade-responsive-v1';
const ARCADE_PROFILE_ID='arcade-responsive-v2';
const DEFAULT_PROFILE_ID=LEGACY_ARCADE_PROFILE_ID;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const digest=value=>createHash('sha256').update(JSON.stringify(['sf-c15-control-profile',canonical(value)])).digest('hex');
const LEGACY_BASE=Object.freeze({pilotHitRadiusUnits:700,projectileHitRadiusUnits:200,
  pointerTargetScalePermille:1000,maxTargetLagUnits:13200});
const RAW=Object.freeze({
  [CURRENT_PROFILE_ID]:Object.freeze({version:VERSION,id:CURRENT_PROFILE_ID,
    policyVersion:'v8c6b-pierce-burst-preview-v3',keyboardUnitsPer60HzFrame:.3,
    releasePolicy:'stop-at-ship',renderFollowMs:24,deadZonePermille:500,
    ...LEGACY_BASE,commercialRc1c:true}),
  [LEGACY_ARCADE_PROFILE_ID]:Object.freeze({version:VERSION,id:LEGACY_ARCADE_PROFILE_ID,
    policyVersion:'v8c6b-pierce-burst-preview-v4-arcade',keyboardUnitsPer60HzFrame:.45,
    releasePolicy:'retain-target',renderFollowMs:10,deadZonePermille:350,
    ...LEGACY_BASE,commercialRc1c:true}),
  [ARCADE_PROFILE_ID]:Object.freeze({version:V2_VERSION,id:ARCADE_PROFILE_ID,
    policyVersion:'v8c6b-pierce-burst-preview-v5-arcade-rc5',keyboardUnitsPer60HzFrame:1.5,
    releasePolicy:'retain-target',cancelPolicy:'stop-at-ship',renderFollowMs:4,deadZonePermille:180,
    pilotHitRadiusUnits:700,projectileHitRadiusUnits:200,pointerTargetScalePermille:1000,
    maxTargetLagUnits:40000,maxMovePerTickUnits:3600,coordinateContract:'arena-relative-v2',edgeCompensationPermille:1050,
    renderPredictionLeadPermille:500,simulationHz:30,commercialRc1c:true,commercialRc5:true}),
});
const PROFILES=freeze(Object.fromEntries(Object.entries(RAW).map(([id,value])=>[id,{...value,profileDigest:digest(value)}])));
function resolveC15ControlProfile(id=DEFAULT_PROFILE_ID){
  const value=PROFILES[id];if(!value)throw new TypeError(`C15 unsupported control profile: ${id}`);return value;
}
function resolveC15ControlProfileForPolicy(policy){
  if(!record(policy)||typeof policy.version!=='string'||typeof policy.keyboardUnitsPer60HzFrame!=='number')
    throw new TypeError('C15 control policy invalid');
  const value=Object.values(PROFILES).find(profile=>profile.policyVersion===policy.version
    &&profile.keyboardUnitsPer60HzFrame===policy.keyboardUnitsPer60HzFrame
    &&profile.pilotHitRadiusUnits===policy.pilotHitRadiusUnits
    &&profile.projectileHitRadiusUnits===policy.projectileHitRadiusUnits);
  if(!value)throw new TypeError('C15 control policy is not registered');return value;
}
function createC15MovementPolicy(profileId=DEFAULT_PROFILE_ID){
  const profile=resolveC15ControlProfile(profileId);
  return freeze({version:profile.policyVersion,keyboardUnitsPer60HzFrame:profile.keyboardUnitsPer60HzFrame,
    pilotHitRadiusUnits:profile.pilotHitRadiusUnits,projectileHitRadiusUnits:profile.projectileHitRadiusUnits});
}
module.exports=freeze({VERSION,V2_VERSION,DEFAULT_PROFILE_ID,CURRENT_PROFILE_ID,LEGACY_ARCADE_PROFILE_ID,ARCADE_PROFILE_ID,
  C15_CONTROL_PROFILES:PROFILES,resolveC15ControlProfile,resolveC15ControlProfileForPolicy,createC15MovementPolicy});
