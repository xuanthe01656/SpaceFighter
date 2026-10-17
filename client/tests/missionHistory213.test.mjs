import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIRCRAFTS, DEFAULT_CAMPAIGN_DATA } from '../src/constants.js';
import { chooseShipRenderQuality, resolveShipVisual } from '../src/game/rendering/ShipVisualCatalog.js';
import { ensureAttendanceWeek } from '../src/utils/attendanceWeek.js';
import { recordGuestAttendance } from '../src/utils/guestProgress.js';

test('desktop quality uses approved X-Wing sprite, heavy GLB remains available by explicit quality=auto',()=>{
  const ship=resolveShipVisual('ship_xwing',AIRCRAFTS);
  for(const agent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Android Pixel 10','Mozilla/5.0 (Macintosh)'])
    assert.equal(chooseShipRenderQuality(ship,agent),'sprite');
  assert.equal(ship.modelSrc,'/models/ships/ship_xwing.glb');
  const source=fs.readFileSync(new URL('../src/game/rendering/ShipVisualFactory.js',import.meta.url),'utf8');
  assert.match(source,/const quality = options\.quality \|\| chooseShipRenderQuality\(visual\)/);
  assert.match(source,/if \(quality === 'auto' && visual\.modelSrc\)/);
});

test('Guest 7-slot calendar counts Ghosts, natural streak and missions do not',()=>{
  const c=structuredClone(DEFAULT_CAMPAIGN_DATA);
  const at=Date.parse('2026-10-16T11:00:00Z');
  assert.equal(recordGuestAttendance(c,{},at).ok,true);
  assert.equal(recordGuestAttendance(c,{makeupDay:1},at).ok,true);
  assert.equal(recordGuestAttendance(c,{makeupDay:2},at).ok,true);
  assert.equal(c.attendance.weeklyCompletedDays,3);
  assert.equal(c.attendance.weeklyStreak,3); // backwards-compatible mirror
  assert.equal(c.attendance.streak,1);
  assert.equal(c.missionData.progress.w_login_5,1);
  assert.equal(c.missionData.progress.m_login_30,1);
  assert.equal(ensureAttendanceWeek(c.attendance,at),false);
  assert.equal(c.attendance.weeklyCompletedDays,3);
});

test('old Guest attendance without weeklyCompletedDays migrates without resetting week or wallet',()=>{
  const att={weekKey:'2026-10-12',claimedDays:[5,2,1,2,5],weeklyStreak:98,makeupCount:2,streak:1};
  assert.equal(ensureAttendanceWeek(att,Date.parse('2026-10-16T10:00:00Z')),true);
  assert.equal(att.weeklyCompletedDays,3);
  assert.equal(att.weeklyStreak,3);
  assert.deepEqual(att.claimedDays,[1,2,5]);
});
