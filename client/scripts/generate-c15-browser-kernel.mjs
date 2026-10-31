import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const server=path.join(root,'server','lib');
const out=path.join(root,'client','src','generated','c15-kernel');
const check=process.argv.includes('--check');
fs.mkdirSync(out,{recursive:true});
const normalizeText=text=>String(text).replace(/\r\n?/g,'\n');
function output(name,text){const target=path.join(out,name),expected=normalizeText(text);if(check){if(!fs.existsSync(target)||normalizeText(fs.readFileSync(target,'utf8'))!==expected)throw new Error(`Generated C15 kernel is stale: ${name}`);}else fs.writeFileSync(target,expected);}

const constants=`export const SNAPSHOT_VERSION='pve-battle-snapshot-preview-v1';\nexport const CORE_VERSION='pve-core-poc-v1';\nexport const TICK_HZ=30;\nexport const UNITS_PER_WORLD=1000;\n`;
const hash=`const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
function sha256Hex(text){const bytes=new TextEncoder().encode(String(text));const bitLen=bytes.length*8;const total=((bytes.length+9+63)>>6)<<6;const data=new Uint8Array(total);data.set(bytes);data[bytes.length]=0x80;const view=new DataView(data.buffer);view.setUint32(total-8,Math.floor(bitLen/0x100000000),false);view.setUint32(total-4,bitLen>>>0,false);let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Uint32Array(64);for(let off=0;off<total;off+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(off+i*4,false);for(let i=16;i<64;i++){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);const s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let i=0;i<64;i++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);const ch=(e&f)^(~e&g);const t1=(h+S1+ch+K[i]+w[i])>>>0;const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;}return [h0,h1,h2,h3,h4,h5,h6,h7].map(x=>x.toString(16).padStart(8,'0')).join('');}
export function createHash(algorithm){if(String(algorithm).toLowerCase()!=='sha256')throw new TypeError('Only sha256 is supported');let value='';return {update(chunk){value+=typeof chunk==='string'?chunk:new TextDecoder().decode(chunk);return this;},digest(encoding){const hex=sha256Hex(value);if(encoding==='hex')return hex;throw new TypeError('Only hex digest is supported');}};}
export {sha256Hex};
`;
output('C15KernelConstants.js',constants);
output('C15KernelHash.js',hash);

const specs={
  'combatInputJournalV8.cjs':{
    out:'CombatInputJournalV8.js',
    imports:[["const { createHash } = require('node:crypto');","import {createHash} from './C15KernelHash.js';"]],
    exports:'PROTOCOL_VERSION,TICK_HZ,MAX_CHUNK_FRAMES,MAX_BATTLE_TICKS,MAX_LAG_TICKS,CombatInputError,openInputJournal,validateChunk,ingestInputChunk'
  },
  'combatMovementWeaponV8.cjs':{
    out:'CombatMovementWeaponV8.js',
    imports:[
      ["const { SNAPSHOT_VERSION } = require('./battleSnapshotV8.cjs');","import {SNAPSHOT_VERSION,CORE_VERSION,TICK_HZ,UNITS_PER_WORLD} from './C15KernelConstants.js';"],
      ["const { CORE_VERSION, TICK_HZ, UNITS_PER_WORLD } = require('./combatCoreV8.cjs');",''],
      ["const { PROTOCOL_VERSION, MAX_BATTLE_TICKS } = require('./combatInputJournalV8.cjs');","import {PROTOCOL_VERSION,MAX_BATTLE_TICKS} from './CombatInputJournalV8.js';"]
    ],
    exports:'FOUNDATION_VERSION,POLICY_VERSION,ARCADE_POLICY_VERSION,TIMER_VERSION,MovementWeaponError,previewFromTrustedSnapshot,advancePreviewMovement,previewMainProjectile,openFireClock,advanceFireClock'
  },
  'combatPreviewReplayV8.cjs':{
    out:'CombatPreviewReplayV8.js',
    imports:[
      ["const { createHash } = require('node:crypto');","import {createHash} from './C15KernelHash.js';"],
      ["const { openInputJournal, validateChunk, ingestInputChunk, MAX_BATTLE_TICKS } = require('./combatInputJournalV8.cjs');","import {openInputJournal,validateChunk,ingestInputChunk,MAX_BATTLE_TICKS} from './CombatInputJournalV8.js';"],
      [/const \{([\s\S]*?)\} = require\('\.\/combatMovementWeaponV8\.cjs'\);/,(_,body)=>`import {${body}} from './CombatMovementWeaponV8.js';`]
    ],
    exports:'REPLAY_VERSION,FoundationReplayError,openFoundationPreview,replayFoundationChunk'
  },
  'combatCampaignAlphaC6CV8.cjs':{
    out:'CombatCampaignAlphaC6CV8.js',
    imports:[["const {SNAPSHOT_VERSION}=require('./battleSnapshotV8.cjs');","import {SNAPSHOT_VERSION} from './C15KernelConstants.js';"]],
    exports:'ENCOUNTER_C6C_VERSION,ENCOUNTER_C6D_VERSION,ENCOUNTER_C6E_VERSION,ALPHA_POLICY_C6D_VERSION,ALPHA_POLICY_C6E_VERSION,shouldCullCampaignEnemy,resolveCampaignAlphaStage1C6E,resolveCampaignAlphaStage1C6D,ALPHA_POLICY_VERSION,LOCATION_ID,RULES_VERSION,CATALOG_VERSION,WAVE_COUNT,BASE_ENEMIES,TIME_LIMIT_SECONDS,FIRST_WAVE_AT_TICK,INTER_WAVE_DELAY_TICKS,ARENA_HALF_WIDTH_UNITS,ARENA_HALF_HEIGHT_UNITS,CampaignAlphaC6CError,resolveCampaignAlphaStage1C6C'
  },
  'combatVerticalSliceV8.cjs':{
    out:'CombatVerticalSliceV8.js',
    imports:[
      ["const {createHash} = require('node:crypto');","import {createHash} from './C15KernelHash.js';"],
      ["const {MAX_BATTLE_TICKS, validateChunk} = require('./combatInputJournalV8.cjs');","import {MAX_BATTLE_TICKS,validateChunk} from './CombatInputJournalV8.js';"],
      ["const {advancePreviewMovement,FOUNDATION_VERSION} = require('./combatMovementWeaponV8.cjs');","import {advancePreviewMovement,FOUNDATION_VERSION} from './CombatMovementWeaponV8.js';"],
      ["const {openFoundationPreview, replayFoundationChunk} = require('./combatPreviewReplayV8.cjs');","import {openFoundationPreview,replayFoundationChunk} from './CombatPreviewReplayV8.js';"],
      [/const \{ENCOUNTER_C6C_VERSION([\s\S]*?)\} = require\('\.\/combatCampaignAlphaC6CV8\.cjs'\);/,(_,tail)=>`import {ENCOUNTER_C6C_VERSION${tail}} from './CombatCampaignAlphaC6CV8.js';`]
    ],
    exports:'SLICE_VERSION,ENCOUNTER_VERSION,CombatVerticalSliceError,openCombatVerticalSlice,replayCombatSliceChunk'
  }
};
function transform(name,spec){let text=normalizeText(fs.readFileSync(path.join(server,name),'utf8')).replace(/^'use strict';\s*/,'');for(const [from,to] of spec.imports){if(from instanceof RegExp){if(!from.test(text))throw new Error(`Missing regex import in ${name}`);text=text.replace(from,to);}else{if(!text.includes(from))throw new Error(`Missing import in ${name}: ${from}`);text=text.replace(from,to);}}
  text=text.replace(/module\.exports\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);?\s*$/m,`export {${spec.exports}};\n`);
  if(/module\.exports/.test(text)||/require\(/.test(text))throw new Error(`Unconverted CommonJS in ${name}`);
  output(spec.out,text);
}
for(const [name,spec] of Object.entries(specs))transform(name,spec);
output('index.js',`export * from './CombatInputJournalV8.js';\nexport * from './CombatVerticalSliceV8.js';\n`);
console.log(`${check?'C15_BROWSER_KERNEL_CHECK_OK':'C15_BROWSER_KERNEL_GENERATED'} ${out}`);
