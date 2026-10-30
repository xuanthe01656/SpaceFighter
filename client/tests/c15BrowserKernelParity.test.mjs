import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openInputJournal as openBrowserJournal} from '../src/generated/c15-kernel/CombatInputJournalV8.js';
import {openCombatVerticalSlice as openBrowserSlice,replayCombatSliceChunk as replayBrowserChunk}
  from '../src/generated/c15-kernel/CombatVerticalSliceV8.js';
const require=createRequire(import.meta.url);
const clientRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {createC15Rc1Fixture}=require('../../server/tools/c15Rc1Fixture.cjs');
const {openInputJournal:openServerJournal}=require('../../server/lib/combatInputJournalV8.cjs');
const {openCombatVerticalSlice:openServerSlice,replayCombatSliceChunk:replayServerChunk}=require('../../server/lib/combatVerticalSliceV8.cjs');
function frozen(value){if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;}

test('generated browser C15 kernel is byte-for-byte identical to server deterministic replay',async()=>{
  const fixture=await createC15Rc1Fixture();const s=fixture.snapshot;
  const journalArgs={uid:fixture.uid,sessionId:fixture.sessionId,battleId:fixture.battleId,
    rulesVersion:s.context.rulesVersion,loadoutHash:s.loadoutHash,issuedAtMs:fixture.issuedAtMs};
  let server=openServerSlice({snapshot:frozen(structuredClone(s)),journal:openServerJournal(journalArgs),
    policy:frozen(structuredClone(fixture.policy)),encounter:frozen(structuredClone(fixture.encounter))});
  let browser=openBrowserSlice({snapshot:frozen(structuredClone(s)),journal:openBrowserJournal(journalArgs),
    policy:frozen(structuredClone(fixture.policy)),encounter:frozen(structuredClone(fixture.encounter))});
  const frames=Array.from({length:60},(_,i)=>i%17===0?{x:0,z:-127}:{x:i%11<5?-127:i%11>6?127:0,z:0});
  for(let offset=0;offset<frames.length;offset+=15){const chunk={protocol:'pve-input-v1',battleId:fixture.battleId,startTick:offset,frames:frames.slice(offset,offset+15)};
    const receivedAtMs=fixture.issuedAtMs+Math.ceil((offset+15)*1000/30)+10;
    server=replayServerChunk({run:server,chunk,receivedAtMs}).run;browser=replayBrowserChunk({run:browser,chunk,receivedAtMs}).run;}
  assert.deepEqual(browser,server);assert.equal(browser.state.stateDigest,server.state.stateDigest);
});

test('generated browser kernel source contains no Node runtime imports or settlement paths',async()=>{
  const fs=await import('node:fs');const dir=path.join(clientRoot,'src/generated/c15-kernel');
  for(const name of fs.readdirSync(dir)){const text=fs.readFileSync(path.join(dir,name),'utf8');assert.doesNotMatch(text,/require\(|node:|verifiedSettlement|wallet|cloudRewards/);}
});
