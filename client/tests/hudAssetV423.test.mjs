import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('HUD V2 art is in a single shared shell for Campaign and Dungeon',()=>{
 const hud=read('src/ui-system/TacticalCombatHudV411.jsx');
 const dun=read('src/ui-system/DungeonHudV396.jsx');
 const cam=read('src/ui-system/CampaignTacticalHudV420.jsx');
 assert.match(hud,/data-asset-skin=/);
 assert.match(hud,/data-hud-theme=\{skin\}/);
 assert.match(dun,/hudTheme="dungeon"/);
 assert.match(cam,/TacticalCombatHudV411/);
 assert.match(hud,/\{hpNow\}/);
 assert.match(hud,/\{bossRatio \* 100\}/);
 assert.match(hud,/VITE_SF_HUD_ASSETS_V2/);
});
test('ability cluster uses art but retains pointerdown and live cooldown',()=>{
 const src=read('src/ui-system/TacticalAbilityClusterV411.jsx');
 const css=read('src/ui-system/TacticalAbilityClusterV411.module.css');
 assert.match(src,/artFrameActive/);
 assert.match(src,/artFramePassive/);
 assert.match(src,/onPointerDown=\{activatePointer\}/);
 assert.match(src,/\{active\.remainingSeconds\}/);
 assert.match(src,/disabled=\{blocked\}/);
 assert.match(css,/touch-action:\s*none/);
});
test('credits are accessible from Portal even though this baseline has no Settings page',()=>{
 const p=read('src/components/Portal/index.jsx');
 const c=read('src/components/Portal/HudAssetCreditsV423.jsx');
 assert.match(p,/HudAssetCreditsV423/);
 for(const author of ['upklyak','pch.vector','redgreystock','pikisuperstar','Freepik'])assert.ok(c.includes(author));
 assert.match(c,/role="dialog"/);
});
