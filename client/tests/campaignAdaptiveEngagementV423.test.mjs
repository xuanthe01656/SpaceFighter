import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
 CAMPAIGN_ADAPTIVE_ENGAGEMENT_VERSION_V423,
 resolveCampaignAdaptiveEngagementV423,
 resolveCampaignAdaptiveEnemyArchetypeV423,
} from '../src/game/combat/CampaignAdaptiveEngagementV423.js';
const here=dirname(fileURLToPath(import.meta.url));
const read=name=>readFileSync(resolve(here,'..',name),'utf8');
const roles=['raider','gunner','shieldbearer','support','artillery'];

test('V4.2.3 per-role range contract is versioned and player-relative',()=>{
 assert.equal(CAMPAIGN_ADAPTIVE_ENGAGEMENT_VERSION_V423,'campaign-adaptive-engagement-v4.2.3');
 const bands=Object.fromEntries(roles.map(id=>[id,resolveCampaignAdaptiveEngagementV423({roleId:id,playerZ:12.5,topSafeRootZ:-9})]));
 assert.ok(bands.raider.preferredRange < bands.gunner.preferredRange);
 assert.ok(bands.gunner.preferredRange < bands.support.preferredRange);
 assert.ok(bands.support.preferredRange < bands.artillery.preferredRange);
 for(const [id,band] of Object.entries(bands)){
  assert.equal(band.rangeMetric,'forward_depth',id);
  assert.ok(band.fireRangeMin>=2.8 && band.fireRangeMin <band.preferredRange,id);
  assert.ok(band.fireRangeMax>band.preferredRange && band.fireRangeMax<=band.visibleDepth+.11,id);
  assert.ok(band.aimAnchorZ>=band.minimumEnemyZ,id);
 }
 assert.ok(Math.abs(bands.gunner.aimAnchorZ)<=1,'gunner first volley should originate around the arena midline when pilot is at bottom');
});

test('firing positions track the player moving upward, without drift toward contact range',()=>{
 for(const roleId of roles){
  const bottom=resolveCampaignAdaptiveEngagementV423({roleId,playerZ:12.5,topSafeRootZ:-9});
  const upper=resolveCampaignAdaptiveEngagementV423({roleId,playerZ:2,topSafeRootZ:-9});
  assert.ok(upper.preferredRange<bottom.preferredRange,roleId);
  assert.ok(upper.aimAnchorZ<bottom.aimAnchorZ,roleId);
  assert.ok(upper.fireRangeMin>=2.8,roleId);
 }
});

test('charger remains contact-only and cannot inherit ranged geometry',()=>{
 const charger={id:'charger',canShoot:false,canCrossPlayer:true,preferredRange:8.5,fireRangeMin:0,fireRangeMax:0};
 assert.strictEqual(resolveCampaignAdaptiveEnemyArchetypeV423(charger,{playerZ:12.5,topSafeRootZ:-9}),charger);
 assert.equal(resolveCampaignAdaptiveEngagementV423({roleId:'charger',playerZ:12.5,topSafeRootZ:-9}),null);
});

test('invalid coordinates preserve original catalog and never synthesize NaNs',()=>{
 const obj={id:'gunner',canShoot:true,canCrossPlayer:false,preferredRange:7.8,fireRangeMin:6.3,fireRangeMax:9.6};
 assert.strictEqual(resolveCampaignAdaptiveEnemyArchetypeV423(obj,{playerZ:NaN,topSafeRootZ:-9}),obj);
 assert.strictEqual(resolveCampaignAdaptiveEnemyArchetypeV423(obj,{playerZ:12,topSafeRootZ:-9,enabled:false}),obj);
});

test('V3.7 choreography consumes V4.2.3 band for both target steering and fire gate',()=>{
 const src=read('src/game/combat/CampaignCombatChoreographyV29.js');
 assert.match(src,/resolveCampaignAdaptiveEnemyArchetypeV423/);
 assert.ok(src.match(/resolveCampaignAdaptiveEnemyArchetypeV423/g)?.length>=3);
 assert.match(src,/fireRangeMin: archetype\.fireRangeMin/);
 assert.match(src,/maxCombatZ: finite\(input\.playerZ, 0\) - archetype\.fireRangeMin/);
 assert.match(src,/resolveCampaignFireEnvelopeV36/);
});

test('real V3.7 choreography steers each ranged role above the live player and moves with player depth', async()=>{
 const {createCampaignEnemyChoreographyStateV29,stepCampaignEnemyChoreographyV29,resolveCampaignCombatSafeBandV29}=await import('../src/game/combat/CampaignCombatChoreographyV29.js');
 const args={worldHalfHeight:15,viewportHeight:852,hudOcclusionLineZ:-9.4,playerX:0,enemyX:0,enemyZ:-8,nowMs:0};
 const band=resolveCampaignCombatSafeBandV29({...args,playerZ:12.5});
 for(const roleId of roles){
  const original=stepCampaignEnemyChoreographyV29(createCampaignEnemyChoreographyStateV29({roleId,seed:11}),{...args,playerZ:12.5});
  const advanced=stepCampaignEnemyChoreographyV29(createCampaignEnemyChoreographyStateV29({roleId,seed:11}),{...args,playerZ:4});
  assert.ok(original.handled && advanced.handled,roleId);
  assert.ok(original.fireRangeMin>2.8,roleId);
  assert.ok(original.targetZ>=band.topSafeRootZ,roleId);
  assert.ok(advanced.targetZ<original.targetZ-.6,`${roleId} must move the engagement anchor upward with the player`);
  assert.ok(original.maxCombatZ<=12.5-original.fireRangeMin+.01,roleId);
 }
 const charger=stepCampaignEnemyChoreographyV29(createCampaignEnemyChoreographyStateV29({roleId:'charger'}),{...args,playerZ:12.5});
 assert.equal(charger.handled,false);
});

test('first-shot envelope blocks point-blank ranged fire but permits lateral player movement',async()=>{
 const {resolveCampaignFireEnvelopeV36}=await import('../src/game/combat/CampaignEnemyEngagementV36.js');
 for(const roleId of roles){
  const band=resolveCampaignAdaptiveEngagementV423({roleId,playerZ:12.5,topSafeRootZ:-7.637});
  const close=resolveCampaignFireEnvelopeV36({enemyX:0,enemyZ:12.5-(band.fireRangeMin-1),playerX:0,playerZ:12.5,fireRangeMin:band.fireRangeMin,fireRangeMax:band.fireRangeMax});
  const intended=resolveCampaignFireEnvelopeV36({enemyX:-5.5,enemyZ:12.5-band.preferredRange,playerX:5.5,playerZ:12.5,fireRangeMin:band.fireRangeMin,fireRangeMax:band.fireRangeMax});
  assert.equal(close.rangeReady,false,`${roleId} must not open fire at point blank range`);
  assert.equal(intended.rangeReady,true,`${roleId} must fire within its intended depth band despite lateral separation`);
 }
});

test('2700-tick real choreography soak: all ranged roles fire repeatedly at safe depth, not beside ship',async()=>{
 const {createCampaignEnemyChoreographyStateV29,stepCampaignEnemyChoreographyV29}=await import('../src/game/combat/CampaignCombatChoreographyV29.js');
 for(const roleId of roles){
  const state=createCampaignEnemyChoreographyStateV29({roleId,routeVariant:roleId==='raider'?'double_hook_return':null,lane:.4,strafeDirection:-1,seed:77,nowMs:0});
  let enemyX=2,enemyZ=-7,nowMs=0,fireFrames=0,maxStep=0;
  const firePhases=new Set();
  for(let frame=0;frame<2700;frame++){
   const r=stepCampaignEnemyChoreographyV29(state,{nowMs,frameScale:1,baseSpeed:.035,enemyX,enemyZ,playerX:Math.sin(frame*.017)*2.4,playerZ:12,arenaHalfWidth:7,worldHalfHeight:15,viewportHeight:852,hudOcclusionLineZ:-9.3,separationX:0,separationZ:0,fireCooldownMs:900});
   if(r.mayFire){
    fireFrames++;
    firePhases.add(r.phaseId);
    assert.ok(r.playerRange>=r.fireRangeMin-.3 && r.playerRange<=r.fireRangeMax+.3,`${roleId} fired outside V4.2.3 range`);
   }
   const step=Math.hypot(r.deltaX||0,r.deltaZ||0);
   maxStep=Math.max(maxStep,step);
   enemyX+=r.deltaX||0;enemyZ+=r.deltaZ||0;nowMs+=1000/60;
  }
  assert.ok(fireFrames>20,`${roleId} must repeatedly expose ranged firing opportunities`);
  assert.ok(firePhases.size>=2,`${roleId} must fire from multiple phases`);
  assert.ok(maxStep<=.16,`${roleId} may not teleport or lunge`);
 }
});
