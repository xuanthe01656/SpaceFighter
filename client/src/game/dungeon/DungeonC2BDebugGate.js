import {Capacitor,registerPlugin} from '@capacitor/core';
/** Requires actual native Android DEBUG registration, not just a Vite flag. */
export async function assertDungeonC2BDebugApkGate(){
  if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')
    throw new Error('C2B_ANDROID_DEBUG_APK_REQUIRED');
  const plugin=registerPlugin('SpaceFighterQaTraceExport');
  const result=await plugin.getDebugBuildGate();
  if(result?.debug!==true||result?.c2bQaPlugin!==true)
    throw new Error('C2B_NATIVE_DEBUG_GATE_DENIED');
  return true;
}
