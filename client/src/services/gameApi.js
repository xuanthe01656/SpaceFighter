import { auth } from '../firebase';
import { secureStorage } from '../utils/storageHelper';
import { assertSameAuthUser, retrySameAuthUser } from '../utils/authRequestGuards.mjs';
import { c15ReleaseChannelFromImportMeta } from '../config/C15ReleaseChannel.js';

// The only network path allowed to change an authenticated player's economy.
// Never submit client wallet balances, earned items or reward amounts here.
const customUrl = (import.meta.env.VITE_GAME_API_URL || '').replace(/\/$/,'');
const BASE_URL = customUrl || '/api/v1';
const releaseChannel=c15ReleaseChannelFromImportMeta();
export class GameApiError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}
async function callApi(path, body=null, {session=true,expectedUid=null}={}) {
  const user = auth.currentUser;
  if (!user) throw new GameApiError('LOGIN_REQUIRED','Please sign in to use cloud game features');
  if (expectedUid !== null) assertSameAuthUser(expectedUid,user.uid);
  if (BASE_URL.startsWith('http:') && import.meta.env.PROD) {
    throw new GameApiError('HTTPS_REQUIRED','Game API must use HTTPS in production');
  }
  const token=await user.getIdToken();
  // ID token retrieval is asynchronous: prevent sending user A's request
  // after the UI has switched to user B.
  assertSameAuthUser(user.uid,auth.currentUser?.uid);
  if (expectedUid !== null) assertSameAuthUser(expectedUid,auth.currentUser?.uid);
  const headers={Authorization:`Bearer ${token}`,Accept:'application/json',
    'X-SF-App-Version':releaseChannel.appVersion,'X-SF-Build-Channel':releaseChannel.id};
  let boundSession=null;
  if (body!==null) headers['Content-Type']='application/json';
  if (session) {
    const sid=secureStorage.getItem('astro_session_id');
    if(!sid) throw new GameApiError('SESSION_REQUIRED','Please log in again');
    headers['X-Game-Session']=sid;
    boundSession=sid;
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const result=await fetch(`${BASE_URL}${path}`,{
      method:body===null?'GET':'POST',headers,
      ...(body===null?{}:{body:JSON.stringify(body)}),
      signal:controller.signal,cache:'no-store'
    });
    const response=await result.json().catch(()=>({}));
    // A sign-out/re-login during fetch cannot apply a stale QA checkpoint.
    assertSameAuthUser(expectedUid??user.uid,auth.currentUser?.uid);
    if(boundSession!==null && secureStorage.getItem('astro_session_id')!==boundSession)
      throw new GameApiError('AUTH_STATE_CHANGED','The game session changed');
    if(!result.ok || response.ok!==true) {
      throw new GameApiError(response.code||'API_ERROR',response.message||`Request failed (${result.status})`,result.status);
    }
    return response;
  }catch(err){
    if(err.name==='AbortError') throw new GameApiError('TIMEOUT','Game server did not respond');
    throw err;
  } finally {clearTimeout(timeout);}
}
export const openGameSession=()=>callApi('/session',{}, {session:false});
export const fetchGameProfile=()=>callApi('/profile');
export const changePlayerName=name=>callApi('/profile/name',{name});
export const deleteCloudAccount=expectedUid=>callApi('/account/delete',{}, {expectedUid});
// Retrying the same logical transaction must reuse the SAME requestId. The
// server operation ledger guarantees that a timed-out committed command is not
// executed twice. Never generate a new ID for an automatic retry.
export async function executeGameCommand(command,payload={},requestId=null) {
  const expectedUid=auth.currentUser?.uid;
  if (!expectedUid) throw new GameApiError('LOGIN_REQUIRED','Please sign in to use cloud game features');
  const operation={command,payload,requestId:requestId||crypto.randomUUID()};
  // A timeout may happen after Firebase sign-out/account switch. A retry must
  // stay bound to the original uid and reuse the same idempotency requestId.
  return retrySameAuthUser({
    expectedUid,
    getCurrentUid:()=>auth.currentUser?.uid,
    request:()=>callApi('/command',operation,{expectedUid}),
    shouldRetry:error=>error?.code==='TIMEOUT'||error instanceof TypeError
  });
}

// C8: strictly isolated QA-only Cloud Alpha 1 transport. No economy requests.
// These wrappers never send client-authored outcomes or rewards; retry keeps
// exactly the same immutable request body/chunk and Firebase account.
async function qaBound(path,body,expectedUid,{retry=true}={}) {
  if(!expectedUid)throw new GameApiError('LOGIN_REQUIRED','Google session required for QA');
  const request=()=>callApi(`/qa/battle/${path}`,body,{expectedUid});
  return retry ? retrySameAuthUser({expectedUid,
    getCurrentUid:()=>auth.currentUser?.uid,request,
    shouldRetry:e=>e?.code==='TIMEOUT'||e instanceof TypeError}) : request();
}
export const openCloudQaC8=(uid,body)=>qaBound('open',body,uid);
export const sendCloudQaInputC8=(uid,body)=>qaBound('input',body,uid);
export const getCloudQaStatusC8=uid=>callApi('/qa/battle/status',null,{expectedUid:uid});
export const finalizeCloudQaC8=(uid,body)=>qaBound('receipt',body,uid);
export const auditCloudQaC8=(uid,body)=>qaBound('audit',body,uid);
export const abandonCloudQaC8=(uid,body)=>qaBound('abandon',body,uid);

// C12: staging-only non-economic production-namespace candidate. Completely
// distinct from C8 QA and from the normal /command economy path. The client
// can submit only input intent and must not fabricate a victory/reward.
async function candidateBoundC12(path,body,expectedUid){
  if(!expectedUid)throw new GameApiError('LOGIN_REQUIRED','Google session required for C12');
  const request=()=>callApi(`/candidate/battle/${path}`,body,{expectedUid});
  return retrySameAuthUser({expectedUid,getCurrentUid:()=>auth.currentUser?.uid,
    request,shouldRetry:e=>e?.code==='TIMEOUT'||e instanceof TypeError});
}
export const openCandidateBattleC12=(uid,body)=>candidateBoundC12('open',body,uid);
export const sendCandidateInputC12=(uid,body)=>candidateBoundC12('input',body,uid);
export const getCandidateStatusC12=uid=>callApi('/candidate/battle/status',null,{expectedUid:uid});
export const auditCandidateBattleC12=(uid,body)=>candidateBoundC12('audit',body,uid);
export const abandonCandidateBattleC12=(uid,body)=>candidateBoundC12('abandon',body,uid);

// C15-RC1B: staging-only commercial-local runtime. Gameplay runs locally;
// these endpoints only issue signed genesis, persist input journal chunks and
// independently replay/finalize a NON-ECONOMIC result.
async function c15Bound(path,body,expectedUid,{retry=true}={}) {
  if(!expectedUid)throw new GameApiError('LOGIN_REQUIRED','Google session required for C15 RC1B');
  const request=()=>callApi(`/c15/battle/${path}`,body,{expectedUid});
  return retry ? retrySameAuthUser({expectedUid,getCurrentUid:()=>auth.currentUser?.uid,
    request,shouldRetry:e=>e?.code==='TIMEOUT'||e instanceof TypeError}) : request();
}
export const openC15Rc1bBattle=(uid,body)=>c15Bound('open',body,uid);
export const uploadC15Rc1bChunk=(uid,body)=>c15Bound('chunk',body,uid);
export const getC15Rc1bStatus=uid=>callApi('/c15/battle/status',null,{expectedUid:uid});
export const finalizeC15Rc1bBattle=(uid,body)=>c15Bound('finalize',body,uid,{retry:false});
export const abandonC15Rc1bBattle=(uid,body)=>c15Bound('abandon',body,uid,{retry:false});
export const claimC15Rc3Settlement=(uid,body)=>retrySameAuthUser({expectedUid:uid,getCurrentUid:()=>auth.currentUser?.uid,
  request:()=>callApi('/c15/settlement/claim',body,{expectedUid:uid}),
  shouldRetry:error=>error?.code==='TIMEOUT'||error instanceof TypeError});
export async function fetchC15ResourceManifest(){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`${BASE_URL}/c15/resources/manifest`,{method:'GET',headers:{Accept:'application/json'},
      signal:controller.signal,cache:'no-store'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok||body.ok!==true)throw new GameApiError(body.code||'C15_RESOURCE_ERROR',
      body.message||`Resource manifest failed (${response.status})`,response.status);
    return body.manifest;
  }catch(error){if(error.name==='AbortError')throw new GameApiError('TIMEOUT','Resource manifest timed out');throw error;}
  finally{clearTimeout(timeout);}
}
