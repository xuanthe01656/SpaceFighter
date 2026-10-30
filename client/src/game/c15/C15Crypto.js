export async function c15Sha256Hex(value){
  const bytes=value instanceof Uint8Array?value:value instanceof ArrayBuffer?new Uint8Array(value):new TextEncoder().encode(String(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function c15Canonical(value){
  if(Array.isArray(value))return value.map(c15Canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,c15Canonical(value[key])]));
  return value;
}
export const c15CanonicalJson=value=>JSON.stringify(c15Canonical(value));
