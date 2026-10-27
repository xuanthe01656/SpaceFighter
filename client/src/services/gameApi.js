import { auth } from '../firebase';
import { secureStorage } from '../utils/storageHelper';
import { assertSameAuthUser, retrySameAuthUser } from '../utils/authRequestGuards.mjs';

// The only network path allowed to change an authenticated player's economy.
// Never submit client wallet balances, earned items or reward amounts here.
const customUrl = (import.meta.env.VITE_GAME_API_URL || '').replace(/\/$/,'');
const BASE_URL = customUrl || '/api/v1';
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
  const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
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
