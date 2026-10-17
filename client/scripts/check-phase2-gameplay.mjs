// Focused static regression checks; runtime gameplay still requires device UAT.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read = rel => fs.readFileSync(path.join(client,rel),'utf8');
const campaign = read('src/components/Campaign/CampaignScene.js');
const dungeon = read('src/components/Dungeon/DungeonScene.js');
const hq = read('src/components/HQ/index.jsx');
const dselect = read('src/components/DungeonSelect/index.jsx');
const dresult = read('src/components/DungeonResult/index.jsx');
const cm = read('src/components/Campaign/CampaignEngine.jsx');
const dm = read('src/components/Dungeon/DungeonEngine.jsx');
const stat = read('src/utils/combatStats.js');
const guest = read('src/utils/guestProgress.js');
const shop = read('src/components/ShopCampaign/index.jsx');
const checks = [
  ['HQ and both battle scenes share combat stat model', /deriveCombatLoadout\(/.test(hq) && [campaign,dungeon].every(x=>/deriveBattleLoadout\(/.test(x)) && /const base = deriveCombatLoadout\(/.test(stat)],
  ['HQ aircraft level is defined', /const acLevel\s*=/.test(hq)],
  ['Main/wingman/drone fire rate units normalized', /rate < 10 \? rate \* 1000 : rate/.test(stat) && /wingFireRate: fireIntervalMs/.test(stat) && /droneFireRate: fireIntervalMs/.test(stat)],
  ['Dungeon damage applies to enemy exactly once per projectile', [campaign,dungeon].every(x=>/enemy\.hp -= damage;/.test(x) && /shots\.registerHit\(bullet, e\)/.test(x)) && !/e\.hp -= stats\.atk;/.test(dungeon)],
  ['Campaign and Dungeon use FPS-independent frame scaler', [campaign,dungeon].every(x=>/frameScale\(engine\.getDeltaTime\(\)\)/.test(x))],
  ['Campaign and Dungeon clean scheduled callbacks on disposal', [campaign,dungeon].every(x=>/scene\.onDisposeObservable\.add/.test(x) && /pendingTimers\.forEach\(clearTimeout\)/.test(x))],
  ['Dungeon calendar consistently uses UTC', /dungeonDayUTC\(getRealTime\(\)\)/.test(dselect) && /isDungeonOpenUTC\(dungeon,getRealTime\(\)\)/.test(dselect)],
  ['Retreat waits for server ticket settlement', [cm,dm].every(x=>/await gameAction\('battle\.abandon'/.test(x) && /catch \(error\)/.test(x))],
  ['Guest counters are not sent as proof of cloud battle', /Guest-only/.test(guest) && /if \(auth\.currentUser\)/.test(shop) && /if \(auth\.currentUser\)/.test(dresult)],
  ['Paid gem purchase remains disabled', /const handleTopup = \(\) =>/.test(shop) && !/grantGemsSuccess/.test(shop)],
  ['Dungeon guest rewards paid only at claim', !/gsRef\.current\.coins\s*=/.test(dungeon) && /activeCoinMultiplier\(EVENT_CONFIG\)/.test(dm)],
  ['Guest event kill-rush filters active dates', /recordGuestEventKill/.test(campaign) && /recordGuestEventKill/.test(dungeon)],
  ['Dungeon cloud rewards always use battle.finish', /await gameAction\('battle\.finish'/.test(dresult)],
  ['Campaign cloud victory uses battle.finish', /await gameAction\('battle\.finish'/.test(campaign)],
];
let failed=0;
for (const [name,pass] of checks) {
 console.log(`${pass?'PASS':'FAIL'} ${name}`);
 if(!pass)failed++;
}
console.log(`Phase2 gameplay static checks: ${checks.length-failed}/${checks.length} PASS`);
if(failed) process.exitCode=1;
