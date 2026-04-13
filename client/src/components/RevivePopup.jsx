import React from 'react';

export default function RevivePopup({ 
  gsRef, 
  uiUpdates, 
  revivePlayer, 
  handleReviveWithCoins, 
  handleWatchAdRevive, 
  finalizeGameOver, 
  reviveTimer, 
  lang 
}) {
  return (
    <div className="ui-layer" style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.85)', zIndex: 5000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: '#1a1a2e', border: '3px solid #FFD700', borderRadius: '20px', padding: '30px', textAlign: 'center', width: '85%', maxWidth: '350px', boxShadow: '0 0 25px rgba(255, 215, 0, 0.4)' }}>
        <h2 style={{ color: '#FFD700', fontSize: '38px', margin: '0 0 5px 0', fontFamily: "'VT323', monospace", textShadow: '2px 2px 0 #000' }}>
          {lang === 'vi' ? 'TIẾP TỤC?' : 'CONTINUE?'}
        </h2>
        <p style={{ color: '#ccc', fontSize: '18px', margin: '0 0 20px 0' }}>
          {lang === 'vi' ? `Lượt hồi sinh: ${gsRef.current.reviveCount}/2` : `Revives: ${gsRef.current.reviveCount}/2`}
        </p>
        
        {uiUpdates.isVIP ? (
          gsRef.current.reviveCount === 0 ? (
            <button className="btn btn-purple" onClick={revivePlayer} style={{ width: '100%', marginBottom: '12px', fontSize: '22px' }}>
               🎁 {lang === 'vi' ? 'Miễn phí (VIP)' : 'Free (VIP)'}
            </button>
          ) : (
            <button className="btn btn-green" onClick={handleReviveWithCoins} style={{ width: '100%', marginBottom: '12px', fontSize: '22px' }}>
               🪙 550 {lang === 'vi' ? 'Xu' : 'Coins'}
            </button>
          )
        ) : (
          <>
            <button className="btn btn-green" onClick={handleReviveWithCoins} style={{ width: '100%', marginBottom: '12px', fontSize: '22px' }}>
               🪙 550 {lang === 'vi' ? 'Xu' : 'Coins'}
            </button>
            <button className="btn btn-blue" onClick={handleWatchAdRevive} style={{ width: '100%', marginBottom: '15px', fontSize: '22px' }}>
               📺 {lang === 'vi' ? 'Xem Quảng Cáo' : 'Watch Ad'}
            </button>
          </>
        )}
        
        <button onClick={finalizeGameOver} style={{ pointerEvents: 'auto', background: 'transparent', color: '#ff4757', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '20px', fontFamily: "'VT323', monospace" }}>
          {lang === 'vi' ? `Bỏ qua (${reviveTimer})` : `Skip (${reviveTimer})`}
        </button>
      </div>
    </div>
  );
}