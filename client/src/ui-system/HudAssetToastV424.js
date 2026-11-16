/** Shared HUD V2 toast presentation, with no gameplay or network side effects. */
export const HUD_ASSET_TOAST_V424 = 'hud-asset-toast-v4.2.4';
const skinPath = '/assets/hud/v424/';

export function createHudAssetToastOptionsV424(enabled = true) {
  const legacy = {
    duration: 3000,
    style: { background: '#1a1a2e', color: '#fff', fontFamily: "'VT323', monospace", fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', border: '2px solid #FFD700', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' },
    success: { style: { background: '#2ed573', borderColor: '#2ed573' }, iconTheme: { primary: '#fff', secondary: '#2ed573' } },
    error: { style: { background: '#ff4757', borderColor: '#ff4757' }, iconTheme: { primary: '#fff', secondary: '#ff4757' } },
    loading: { style: { background: '#0abde3', borderColor: '#0abde3' } },
  };
  if (!enabled) return legacy;
  const panel = (name) => ({ backgroundImage: `url("${skinPath}${name}")`, backgroundSize: '100% 100%', backgroundRepeat:'no-repeat' });
  return {
    duration:3000,
    style: {
      ...panel('sf_alert_panel_h_01.webp'), backgroundColor:'#061726',
      color:'#edfaff', fontFamily:"'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize:'16px', fontWeight:800, letterSpacing:'.35px', lineHeight:1.2,
      minHeight:'56px', minWidth:'min(288px, calc(100vw - 42px))', maxWidth:'min(370px, calc(100vw - 24px))',
      padding:'14px 22px', borderRadius:'6px', border:'1px solid rgba(104,240,248,.35)',
      boxShadow:'0 14px 32px rgba(0,0,0,.55),0 0 14px rgba(46,190,218,.2)',
      textShadow:'0 1px 2px #03111e', overflowWrap:'anywhere',
    },
    success: { style: { ...panel('sf_alert_panel_h_01.webp'), color:'#d7ffed', borderColor:'#6ce7b4' }, iconTheme: { primary:'#71eab9', secondary:'#061726' } },
    error: { style: { ...panel('sf_alert_panel_h_01__red.webp'), borderColor:'#f68a9a', color:'#ffe6ea' }, iconTheme: { primary:'#ff758c', secondary:'#130714' } },
    loading: { style: { ...panel('sf_alert_panel_h_01__amber.webp'), borderColor:'#ffd28b', color:'#fff1d8' }, iconTheme: { primary:'#ffc77a', secondary:'#251606' } },
  };
}
