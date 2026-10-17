import { auth } from '../firebase';
import { secureStorage } from '../utils/storageHelper';

// The only network path allowed to change an authenticated player's economy.
// Never submit client wallet balances, earned items or reward amounts here.
const customUrl = (import.meta.env.VITE_GAME_API_URL || '').replace(/\/$/,'');
const BASE_URL = customUrl || '/api/v1';
export class GameApiError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}
async function callApi(path, body=null, {session=true}={}) {
  const user = auth.currentUser;
  if (!user) throw new GameApiError('LOGIN_REQUIRED','Please sign in to use cloud game features');
  if (BASE_URL.startsWith('http:') && import.meta.env.PROD) {
    throw new GameApiError('HTTPS_REQUIRED','Game API must use HTTPS in production');
  }
  const token=await user.getIdToken();
  const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
  if (body!==null) headers['Content-Type']='application/json';
  if (session) {
    const sid=secureStorage.getItem('astro_session_id');
    if(!sid) throw new GameApiError('SESSION_REQUIRED','Please log in again');
    headers['X-Game-Session']=sid;
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
export const deleteCloudAccount=()=>callApi('/account/delete',{});
// Retrying the same logical transaction must reuse the SAME requestId. The
// server operation ledger guarantees that a timed-out committed command is not
// executed twice. Never generate a new ID for an automatic retry.
export async function executeGameCommand(command,payload={},requestId=null) {
  const operation={command,payload,requestId:requestId||crypto.randomUUID()};
  try {return await callApi('/command',operation);}
  catch(error) {
    if (error?.code !== 'TIMEOUT' && !(error instanceof TypeError)) throw error;
    return callApi('/command',operation);
  }
}
