'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createProductionOutcomeAuthorityC10}=require('../lib/productionOutcomeAuthorityC10V8.cjs');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('C13 diagnostic is only wired into C12 mobile client, never C10 or server',()=>{
  const instrument=read('client/src/game/combat/CandidateMovementEvidenceC13.js');
  const ui=read('client/src/components/CloudQaAlpha1/index.jsx');
  const offline=read('client/tools/analyzeCandidateMovementC13.mjs');
  const api=read('client/src/services/gameApi.js');
  const server=read('server/server.js');
  const authority=read('server/lib/productionOutcomeAuthorityC10V8.cjs');
  const settlement=read('server/lib/verifiedSettlementC7B2BV8.cjs');
  assert.match(ui,/exportCandidateEvidence/);
  assert.match(ui,/candidate&&/);
  assert.match(instrument,/networkUpload:false/);
  assert.match(instrument,/containsIdentity:false/);
  assert.match(instrument,/productionReplayApproved:false/);
  assert.match(offline,/firestoreRulesIamApproved:false/);
  for(const s of [api,server,authority,settlement])
    assert.doesNotMatch(s,/CandidateMovementEvidenceC13|C13_EVIDENCE_VERSION|candidateMovement/);
});
test('C13 does not unlock C10 outcome authority by possessing diagnostic evidence',()=>{
  const authority=createProductionOutcomeAuthorityC10({enabled:false});
  assert.equal(authority.enabled,false);
  assert.throws(()=>authority.issue('u','s','b'),e=>e.code==='C10_AUTHORITY_DISABLED');
});
test('C13 no new public HTTP endpoint / legacy battle reward writes',()=>{
  const server=read('server/server.js');
  assert.doesNotMatch(server,/api\/v1\/candidate\/battle\/(settle|issue|reward|telemetry)/);
  const source=read('client/src/game/combat/CloudCandidateSessionC12.js');
  assert.doesNotMatch(source,/\.settle\(|\.issue\(|\.grant\(|\/battle\/finish/);
});
