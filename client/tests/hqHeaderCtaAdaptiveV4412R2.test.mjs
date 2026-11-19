import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
const root=process.cwd();
const jsx=fs.readFileSync(path.join(root,'src/components/HQ/CommandHangarV444.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/components/HQ/CommandHangarV444.module.css'),'utf8');
const ast=postcss.parse(css);
const prefix='.screen[data-sf-visual-v447="fleet-industrial"] ';
const sel=(s,media=false)=>{
 const a=[];
 ast.walkRules(rule=>{if(rule.selectors?.includes(prefix+s)&&Boolean(rule.parent?.type==='atrule')===media)a.push(rule)});
 assert.equal(a.length,1,`Unexpected CSS rules for ${s}`);
 return Object.fromEntries(a[0].nodes.filter(x=>x.type==='decl').map(x=>[x.prop,x.value]));
};
test('R2: HQ title/back retained and unused header wallet removed',()=>{
 assert.equal((jsx.match(/data-sf-hq-header-v4412="no-wallet"/g)||[]).length,1);
 assert.doesNotMatch(jsx,/className=\{styles\.wallet\}|<CurrencyChip\s+Icon=\{Icons\?\.(Coin|Gem)/);
 assert.match(jsx,/className=\{styles\.backButton\}/);
 assert.match(jsx,/T\u1ed4NG H\u00c0NH DINH/);
});
test('R2: HQ header uses two columns in portrait and standard layouts',()=>{
 assert.equal(sel('.header')['grid-template-columns'],'46px minmax(0,1fr)');
 assert.equal(sel('.header',true)['grid-template-columns'],'41px minmax(0,1fr)');
});
test('R2: move only CTA content, not image backgrounds/hitboxes',()=>{
 const actions=sel('.actionBar');
 assert.equal(actions.position,'static');
 assert.equal(actions['--sf-hq-cta-art-x'],'clamp(4px,1.4vw,9px)');
 assert.equal(actions['--sf-hq-cta-art-y'],'clamp(5px,.85dvh,9px)');
 for(const x of ['.actionBar .secondaryAction > span','.actionBar .secondaryAction > strong','.actionBar .primaryAction > span'])assert.equal(sel(x).transform,'translate(var(--sf-hq-cta-art-x),var(--sf-hq-cta-art-y))');
 assert.match(sel('.actionBar .primaryAction').background,/sf_neo_button_01__campaign_normal\.webp/);
 assert.match(sel('.actionBar .secondaryAction').background,/sf_neo_button_03__campaign_normal\.webp/);
});
test('R2: six loadout slots, both HQ modes, inventory and pilot actions remain',()=>{
 for(const id of ['mainGun','wingman','armor','drone','pilot','skill'])assert.ok(jsx.includes('slot="'+id+'"'),id);
 for(const s of ['HQ_MODE_PREBATTLE_V444','onEquipItem','onUnequipItem','onSelectAircraft','onLaunch','onBack','setScreen(\'inventory\')','onClick={() => setActiveTab'])assert.ok(jsx.includes(s),s);
});
test('R2: CSS parses and no duplicate visual blocks',()=>{
 assert.equal((css.match(/V4\.4\.12 removes unused HQ wallet/g)||[]).length,1);
 assert.equal((css.match(/--sf-hq-cta-art-x:/g)||[]).length,1);
 assert.equal((css.match(/--sf-hq-cta-art-y:/g)||[]).length,1);
 assert.doesNotMatch(css,/[\t ]+$/m);
});
