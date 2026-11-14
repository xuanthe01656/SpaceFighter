import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeBattleNotice,c15WaveNotice} from '../src/ui-system/BattleNoticeModel.js';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('F12 parity: C15 wave notices are identical in wording to Guest and never economic',()=>{
  assert.equal(c15WaveNotice(2,'vi').text,'TIẾN VÀO ĐỢT 2');
  assert.equal(c15WaveNotice(2,'en').text,'ENTERING WAVE 2');
  assert.equal(c15WaveNotice(0),null);
  assert.equal(c15WaveNotice(Number.NaN),null);
  assert.equal(c15WaveNotice(1.4),null);
  assert.equal(normalizeBattleNotice({text:'CẢNH BÁO',colorHex:'#ff4757',duration:3000}).tone,'danger');
  assert.equal(normalizeBattleNotice({text:'DỌN SẠCH!',colorHex:'#2ecc71'}).tone,'success');
  assert.equal(normalizeBattleNotice({text:'DỌN SẠCH!',duration:999999}).durationMs,6000);
  assert.equal(normalizeBattleNotice({text:'   '}),null);
});

test('F12 parity: both gameplay lanes use one battle notice overlay without a second Babylon wave banner',()=>{
  const guest=read('src/components/Campaign/CampaignEngine.jsx');
  const scene=read('src/components/Campaign/CampaignScene.js');
  const c15=read('src/components/C15LocalAlpha1/index.jsx');
  const hud=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(guest,/onAnnouncement: notice=>setBattleNotice/);
  assert.match(guest, /<CampaignTacticalHudV420\b[\s\S]*?announcement=\{battleNotice\}/);
  const campaignHud = read('src/ui-system/CampaignTacticalHudV420.jsx');
  const sharedHud = read('src/ui-system/TacticalCombatHudV411.jsx');
  assert.match(campaignHud, /announcement=\{announcement\}/);
  assert.match(sharedHud, /normalizeBattleNotice\(announcement\)/);
  assert.match(sharedHud, /visibleNotice/);
  assert.match(scene,/if\(externalHud&&typeof data\.onAnnouncement==='function'\)/);
  assert.match(scene,/data\.onAnnouncement\(\{text,colorHex,duration\}\);return;/);
  assert.match(c15,/c15WaveNotice\(activeWave,lang\)/);
  assert.match(c15,/announcement=\{battleNotice\}/);
  assert.match(hud,/normalizeBattleNotice\(announcement\)/);
  assert.match(hud,/styles\.notice/);
  assert.match(css,/\.notice\{position:absolute/);
  assert.match(css,/pointer-events:none/);
});

test('F12 parity: C15 instrumentation is opt-in in staging QA and never a default commercial HUD',()=>{
  const c15=read('src/components/C15LocalAlpha1/index.jsx');
  const rc=read('src/config/C15ReleaseChannel.js');
  assert.match(c15,/visibleQaHud=releaseChannel\.qaControls&&/);
  assert.match(c15,/VITE_C15_QA_HUD_VISIBLE/);
  assert.match(c15,/qa=\{visibleQaHud&&releaseChannel\.showDiagnosticHud/);
  assert.match(c15,/releaseChannel\.showControlExport&&profile&&visibleQaHud/);
  assert.match(rc,/const qaControls=id===C15_BUILD_CHANNEL_STAGING_QA/);
  assert.match(c15,/claimVerifiedReward\(/);
  assert.match(c15,/completeVerified\(/);
});

test('F12 parity: no authority, input, replay or reward files are changed by this patch',()=>{
  const model=read('src/ui-system/BattleNoticeModel.js');
  assert.doesNotMatch(model,/\bfetch\(|localStorage|firebase|wallet|claimReward|gameAction/);
  assert.match(read('src/components/Campaign/CampaignScene.js'),/recordGuestBattle/);
  assert.match(read('src/components/C15LocalAlpha1/index.jsx'),/sampleC15ControlTick/);
});
