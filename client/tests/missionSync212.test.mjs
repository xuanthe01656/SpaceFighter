import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIRCRAFTS, DEFAULT_CAMPAIGN_DATA } from '../src/constants.js';
import { resolveShipVisual, chooseShipRenderQuality } from '../src/game/rendering/ShipVisualCatalog.js';
import { recordGuestAttendance, ensureGuestMissions } from '../src/utils/guestProgress.js';
const at=s=>Date.parse(s);
test('X-Wing sprite UV correction is aircraft-specific, with mobile sprite render quality',()=>{
 const x=resolveShipVisual('ship_xwing',AIRCRAFTS);
 assert.equal(x.spriteInvertY,true);
 assert.equal(chooseShipRenderQuality(x,'Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile'), 'sprite');
 assert.equal(chooseShipRenderQuality(x,'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'sprite');
 const other=resolveShipVisual(AIRCRAFTS.find(a=>a.id!=='ship_xwing').id,AIRCRAFTS);
 assert.equal(other.spriteInvertY,false,'do not silently flip other ship art');
 const factory=fs.readFileSync(new URL('../src/game/rendering/ShipVisualFactory.js',import.meta.url),'utf8');
 // RC7 may supply an integrity-verified sprite; the catalogue sprite remains fallback.
 assert.match(factory,/const presentationTopSrc = verifiedPresentationTopSrc \|\| visual\.topSrc/);
 assert.match(factory,/quality !== 'procedural' && presentationTopSrc/);
 assert.match(factory,/presentationTopSrc, scene, false, visual\.spriteInvertY,/);
});
test('Guest natural ledger is UTC-only, survives mission period repair, and excludes Ghosts',()=>{
 const c=structuredClone(DEFAULT_CAMPAIGN_DATA);
 const first=at('2026-10-16T12:00:00Z');
 assert.equal(recordGuestAttendance(c,{},first).ok,true);
 assert.deepEqual(c.attendance.naturalClaimDaysUTC,['2026-10-16']);
 assert.equal(recordGuestAttendance(c,{makeupDay:1},first).ok,true);
 assert.deepEqual(c.attendance.naturalClaimDaysUTC,['2026-10-16']);
 c.missionData.progress={d_login:0,w_login_5:0,m_login_30:0};
 ensureGuestMissions(c,first);
 assert.equal(c.missionData.progress.d_login,1);
 assert.equal(c.missionData.progress.w_login_5,1);
 assert.equal(c.missionData.progress.m_login_30,1);
 ensureGuestMissions(c,at('2026-10-17T12:00:00Z'));
 assert.equal(c.missionData.progress.d_login,0);
 assert.equal(c.missionData.progress.w_login_5,1);
 assert.equal(c.missionData.progress.m_login_30,1);
});
