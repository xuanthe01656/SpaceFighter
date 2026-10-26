'use strict';
/**
 * C7-C2A OPTIONAL LOCAL-EMULATOR security exercise. NOT part of npm test.
 * Tests Firebase Client REST permissions against locally loaded Firestore
 * rules. Never contacts production; requires localhost emulator hosts and a
 * demo-only project ID. Does not establish deployed Rules or IAM state.
 * Example: firebase emulators:exec --only auth,firestore \
 *   --project demo-spacefighter-c7c2a \
 *   "node server/tools/firestoreRulesEmulatorC7C2.cjs"
 */
const {randomBytes}=require('node:crypto');
const assert=require('node:assert/strict');
const LOCAL=/^(?:localhost|127\.0\.0\.1):[0-9]{2,5}$/;
const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storeHost=process.env.FIRESTORE_EMULATOR_HOST;
if(!/^demo-spacefighter-[a-z0-9-]+$/.test(project||'')
  ||!LOCAL.test(authHost||'')||!LOCAL.test(storeHost||'')){
  console.error('C7-C2A REFUSED: requires localhost Auth/Firestore emulators and demo-spacefighter-* project');
  process.exitCode=2;
}else{
  run().catch(err=>{
    console.error('C7-C2A EMULATOR TEST FAILED:',err.message);
    process.exitCode=1;
  });
}
async function call(url,method='GET',token,body){
  const response=await fetch(url,{method,
    headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  return {status:response.status};
}
async function signUp(label){
  const res=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:`c7c2-${label}-${randomBytes(5).toString('hex')}@example.test`,
      password:`Qatest_${randomBytes(18).toString('hex')}`,returnSecureToken:true}),
    signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error(`Auth emulator signup failed HTTP ${res.status}`);
  const data=await res.json();
  if(!data.localId||!data.idToken)throw Error('Auth emulator did not return a mock UID/token');
  return {uid:data.localId,token:data.idToken};
}
async function run(){
  // Load Admin SDK ONLY after demo/loopback guards have passed. Admin writes
  // seed fixtures, while REST client requests must obey Firestore Rules.
  const admin=require('firebase-admin');
  const app=admin.initializeApp({projectId:project},`sf-c7c2-emulator-${randomBytes(4).toString('hex')}`);
  const db=app.firestore();
  let ownerRef,otherRef,qaRef,ledgerRef;
  let passed=0;
  const base=`http://${storeHost}/v1/projects/${project}/databases/(default)/documents`;
  const path=relative=>`${base}/${relative}`;
  async function expect(label,status,url,method,token,body){
    const r=await call(url,method,token,body);
    assert.equal(r.status,status,`${label}: expected HTTP ${status}, got ${r.status}`);
    passed++;console.log(`PASS FIRESTORE_RULES_${passed} ${label}`);
  }
  try{
    const alice=await signUp('alice'),bob=await signUp('bob');
    ownerRef=db.doc(`users/${alice.uid}`);otherRef=db.doc(`users/${bob.uid}`);
    qaRef=ownerRef.collection('qaBattleGenesis').doc('qa_test_battle');
    ledgerRef=ownerRef.collection('verifiedBattleSettlements').doc('qa_test_battle');
    await Promise.all([ownerRef.set({test:true}),otherRef.set({test:true}),
      qaRef.set({qaOnly:true}),ledgerRef.set({nonEconomic:true})]);
    await expect('owner_profile_get_allowed',200,path(`users/${alice.uid}`),'GET',alice.token);
    await expect('cross_user_profile_get_denied',403,path(`users/${alice.uid}`),'GET',bob.token);
    await expect('anonymous_profile_get_denied',403,path(`users/${alice.uid}`),'GET');
    await expect('profile_list_denied',403,path('users'),'GET',alice.token);
    await expect('qa_genesis_get_denied',403,path(`users/${alice.uid}/qaBattleGenesis/qa_test_battle`),'GET',alice.token);
    await expect('settlement_ledger_get_denied',403,path(`users/${alice.uid}/verifiedBattleSettlements/qa_test_battle`),'GET',alice.token);
    await expect('client_profile_patch_denied',403,path(`users/${alice.uid}`),'PATCH',alice.token,{fields:{test:{booleanValue:false}}});
    await expect('client_profile_delete_denied',403,path(`users/${alice.uid}`),'DELETE',alice.token);
    await expect('client_qa_genesis_patch_denied',403,path(`users/${alice.uid}/qaBattleGenesis/qa_test_battle`),'PATCH',alice.token,{fields:{qaOnly:{booleanValue:false}}});
    await expect('client_ledger_patch_denied',403,path(`users/${alice.uid}/verifiedBattleSettlements/qa_test_battle`),'PATCH',alice.token,{fields:{coins:{integerValue:'999999'}}});
    await expect('client_deletion_job_create_denied',403,path(`accountDeletionJobs/${alice.uid}`),'PATCH',alice.token,{fields:{status:{stringValue:'pending'}}});
    console.log(`PASS C7C2A_FIRESTORE_EMULATOR_ALL PASSED=${passed} FAILED=0`);
  }finally{
    // Delete only this test's ephemeral emulator documents and users.
    for(const ref of [qaRef,ledgerRef,ownerRef,otherRef]){
      if(ref)await ref.delete().catch(()=>{});
    }
    await app.delete();
  }
}
