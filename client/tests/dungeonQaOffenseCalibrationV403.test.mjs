import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUNGEON_QA_ASSAULT_DAMAGE_SCALE_V403,
  resolveDungeonQaOutgoingDamageScaleV403,
  scaleDungeonQaOutgoingDamageV403,
  DUNGEON_QA_LOADOUT_PRESETS_V397,
  buildDungeonQaCampaignDataV397,
} from '../src/game/dungeon/DungeonQaLoadoutV397.js';
import { createDungeonQaReadinessV400 } from '../src/game/dungeon/DungeonQaReadinessV400.js';

const qa = (preset = 'assault_mk3') => ({
  enabled: true, loadoutPresetId: preset,
  rewardMode: 'none', trustedWrites: false,
});

test('V4.0.3 keeps 4 QA equipment identities and previous V4.0.2 stats', () => {
  const p = DUNGEON_QA_LOADOUT_PRESETS_V397.assault_mk3;
  assert.equal(p.aircraft.id, 'ship_raptor');
  assert.equal(p.aircraft.level, 12);
  assert.equal(p.equipment.mainGun.baseId, 'gun_neutron');
  assert.equal(p.equipment.wingman.baseId, 'wing_homing');
  assert.equal(p.equipment.drone.baseId, 'drone_laser');
  assert.equal(DUNGEON_QA_ASSAULT_DAMAGE_SCALE_V403, 0.10);
});

test('V4.0.3 applies QA-offense multiplier only for isolated assault run', () => {
  assert.equal(resolveDungeonQaOutgoingDamageScaleV403({ qaRun: qa() }), 0.10);
  for (const preset of ['account','control_mk3','fortress_mk4','stress_mk4']) {
    assert.equal(resolveDungeonQaOutgoingDamageScaleV403({qaRun:qa(preset),isDev:true,search:'?sfDungeonDmg=0.05'}),1);
  }
  assert.equal(resolveDungeonQaOutgoingDamageScaleV403({ qaRun: null }), 1);
  assert.equal(resolveDungeonQaOutgoingDamageScaleV403({ qaRun: {...qa(),enabled:false} }), 1);
  assert.equal(resolveDungeonQaOutgoingDamageScaleV403({ qaRun: {...qa(), trustedWrites:true} }), 1);
  assert.equal(resolveDungeonQaOutgoingDamageScaleV403({ qaRun: {...qa(), rewardMode:'claim'} }), 1);
});

test('V4.0.3 development URL can tune between 3% and 100% without new patch', () => {
  for (const value of ['0.03','0.05','0.08','0.1','0.25','1']) {
    assert.equal(resolveDungeonQaOutgoingDamageScaleV403({qaRun:qa(),isDev:true,search:`?sfDungeonDmg=${value}`}),Number(value));
  }
  for (const value of ['','0','0.01','1.01','-1','1e-1','foo','NaN','Infinity',' 0.1']) {
    assert.equal(resolveDungeonQaOutgoingDamageScaleV403({qaRun:qa(),isDev:true,search:`?sfDungeonDmg=${value}`}),0.10);
  }
  assert.equal(resolveDungeonQaOutgoingDamageScaleV403({qaRun:qa(),isDev:false,search:'?sfDungeonDmg=1'}),0.10);
});

test('V4.0.3 scales all positive enemy/boss hits once and leaves base mode equal', () => {
  assert.equal(scaleDungeonQaOutgoingDamageV403(500,0.10),50);
  assert.equal(scaleDungeonQaOutgoingDamageV403(0,0.10),0);
  assert.equal(scaleDungeonQaOutgoingDamageV403(-2,0.10),0);
  assert.equal(scaleDungeonQaOutgoingDamageV403(250,1),250);
  assert.equal(scaleDungeonQaOutgoingDamageV403(250,NaN),250);
});

test('V4.0.3 report carries multiplier, not a production approval', () => {
  const recorder = createDungeonQaReadinessV400({
    enabled:true,dungeonId:'dung_taurus',presetId:'assault_mk3',
    qaOutgoingDamageScale: 0.05,startedAtMs:100,
  });
  recorder.beginRoom({roomId:'taurus_entry',roomIndex:0,nowMs:200,hp:1000});
  recorder.endRoom({nowMs:1600,hp:900});
  recorder.finish({nowMs:1800,hp:900,result:'victory'});
  const report=recorder.snapshot(2000);
  assert.equal(report.qaOutgoingDamageScale,0.05);
  assert.equal(report.productionApproved,false);
  assert.equal(report.hpEnd,900);
});

test('V4.0.3 isolated loadout projection does not mutate account profile', () => {
  const profile = {
    loadout:{aircraft:'ship_xwing',mainGun:'start'},
    ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{start:{baseId:'gun_laser',type:'mainGun',level:1,rarity:1}},
  };
  const before=structuredClone(profile);
  const result=buildDungeonQaCampaignDataV397(profile,qa());
  assert.deepEqual(profile,before);
  assert.equal(result.qaProjection.trustedWrites,false);
});

// Integration guard: verify the live Dungeon scene applies the scale to all
// enemy and Boss health reductions, but not to destructible mission objects.
test('V4.0.3 live scene scales enemies and Boss only, leaving objects untouched', async () => {
  const { readFileSync } = await import('node:fs');
  const scene = readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');
  assert.match(scene, /qaOutgoingDamageScaleV403\s*=\s*resolveDungeonQaOutgoingDamageScaleV403\(/);
  assert.match(scene, /enemy\.hp\s*-=\s*scaleDungeonQaOutgoingDamageV403\(resolvedDamageV410, qaOutgoingDamageScaleV403\)/);
  assert.match(scene, /bossHp\s*-=\s*scaleDungeonQaOutgoingDamageV403\(resolvedDamage, qaOutgoingDamageScaleV403\)/);
  assert.match(scene, /hazard\.hp\s*-=\s*calculateProjectileDamage\(/);
  assert.match(scene, /debris\.hp\s*-=\s*calculateProjectileDamage\(/);
  assert.match(scene, /qaOutgoingDamageScale:\s*qaOutgoingDamageScaleV403/);
});
