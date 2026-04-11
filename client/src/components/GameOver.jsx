import React, { useState, useEffect } from 'react';
import { t } from '../utils/translations'; // 1. Nhúng từ điển
import { Capacitor } from '@capacitor/core';

export default function GameOver({ gsRef, uiUpdates, currentUser, setScreen, submitScore, loginWithGoogle , loginWithApple, lang, setLobbyState, startGame, leaveLobby }) {
  // 2. Lấy bộ từ vựng theo ngôn ngữ hiện tại
  const text = t[lang] || t['vi'];
  const platform = Capacitor.getPlatform();

  // Quản lý input tên và trạng thái đã lưu kỷ lục thành công hay chưa
  const [playerName, setPlayerName] = useState(() => {
    return currentUser?.displayName || localStorage.getItem('astro_custom_name') || '';
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  useEffect(() => {
    if (currentUser?.displayName) {
      setPlayerName(currentUser.displayName);
      localStorage.setItem('astro_custom_name', currentUser.displayName);
    }
  }, [currentUser]);
  const handleSaveScore = async () => {
    const success = await submitScore('single', false, playerName.trim());
    if (success) {
      setIsSubmitted(true);
    }
  };

  return (
    <div className="ui-layer">
      <div className="gameover-panel" style={{ background: 'rgba(0, 0, 0, 0.9)', border: '3px solid #ff4757', borderRadius: '20px', padding: '40px', width: '90%', maxWidth: '500px', boxShadow: '0 0 30px rgba(255, 71, 87, 0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
        
        {/* TIÊU ĐỀ */}
        <div className="go-title" style={{ fontSize: '60px', color: '#ff4757', textShadow: '0 0 10px #ff4757', marginBottom: '5px', fontWeight: 'bold', letterSpacing: '2px' }}>
          {gsRef.current.gameMode === 'single' ? text.gameOverTitle : uiUpdates.gameResult === 'WIN' ? text.winTitle : uiUpdates.gameResult === 'LOSE' ? text.loseTitle : text.drawTitle}
        </div>
        
        {/* ĐIỂM SỐ */}
        <div className="score-display">{text.scoreText} <span>{uiUpdates.finalScore || 0}</span></div>
        
        {gsRef.current.gameMode === 'single' && (
          <div className="best-score">{text.bestScoreText} <span style={{ color: '#FFD700' }}>{uiUpdates.bestScore || 0}</span></div>
        )}

        {/* BẢNG ĐIỂM PVP ONLINE */}
        {gsRef.current.gameMode === 'online' && (
          <div style={{ background: 'rgba(0, 255, 255, 0.1)', border: '1px solid #00FFFF', padding: '10px', width: '100%', textAlign: 'center', borderRadius: '10px', marginBottom: '10px' }}>
            <div style={{ fontSize: '20px', color: '#aaa' }}>{text.opponentText} (<span>{uiUpdates.remoteName}</span>): <span style={{ color: '#00FFFF', fontWeight: 'bold' }}>{uiUpdates.remoteScore || 0}</span></div>
            <div style={{ fontSize: '35px', fontWeight: 'bold', marginTop: '5px', color: uiUpdates.gameResult === 'WIN' ? '#2ed573' : uiUpdates.gameResult === 'LOSE' ? '#ff4757' : '#00FFFF' }}>
              {uiUpdates.gameResult === 'WIN' ? text.youWin : uiUpdates.gameResult === 'LOSE' ? text.youLose : text.youDraw}
            </div>
            <div style={{ color: '#2ed573', fontSize: '16px', marginTop: '5px' }}>{text.autoSaved}</div>
          </div>
        )}
        
        {/* KHU VỰC LƯU ĐIỂM CHƠI ĐƠN */}
        {gsRef.current.gameMode === 'single' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', borderTop: '1px solid #444', paddingTop: '20px', marginTop: '5px' }}>
            {currentUser ? (
              !isSubmitted ? (
                <>
                  <input 
                    type="text" 
                    className="name-input" 
                    placeholder={text.enterName} 
                    maxLength="12" 
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    style={{ width: '80%', padding: '12px', fontFamily: "'VT323', monospace", fontSize: '24px', textAlign: 'center', borderRadius: '8px', border: '2px solid #2ed573', background: 'rgba(0,0,0,0.5)', color: '#fff', outline: 'none', pointerEvents: 'auto' }} 
                  />
                  <button className="btn btn-green" onClick={handleSaveScore} style={{ width: '80%' }}>{text.saveScoreBtn}</button>
                </>
              ) : (
                <div style={{ color: '#2ed573', fontSize: '24px', margin: '10px 0' }}>{text.savedSuccess}</div>
              )
            ) : (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <p style={{ color: '#FFD700', fontSize: '18px', margin: '0 0 10px 0', fontFamily: "'VT323', monospace" }}>{text.loginToSave}</p>
                {/* Gom 2 nút vào chung 1 thẻ div để sắp xếp cho đẹp */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', width: '100%' }}>
                  {platform === 'ios' && (
                  <button onClick={loginWithGoogle} className="btn btn-blue" style={{ width: '90%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', margin: '0 auto' }}>
                    <img src="/images/google.png" alt="Google" style={{ width: '24px' }} /> {text.loginNowBtn}
                  </button>
                  )}
                  {platform === 'ios' && (
                    <button onClick={loginWithApple} className="btn" style={{ width: '90%', background: '#000', color: '#fff', border: '2px solid #555', borderRadius: '8px', padding: '10px', fontSize: '18px', fontFamily: "'VT323', monospace", cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', margin: '0 auto', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                      🍎 {lang === 'vi' ? 'Đăng nhập Apple' : 'Sign in with Apple'}
                    </button>
                  )}

                </div>
              </div>
            )}
          </div>
        )}
        
        {/* CÁC NÚT ĐIỀU HƯỚNG */}
        <div style={{ display: 'flex', gap: '15px', width: '100%', justifyContent: 'center', marginTop: '10px' }}>
          
          <button className="btn btn-red" onClick={() => { 
            if (gsRef.current.gameMode === 'single') {
              startGame('single'); 
            } else {
              setScreen('menu');
              setLobbyState('main');
              leaveLobby();
            }
          }} style={{ flex: 1, fontSize: '22px' }}>
            {text.playAgainBtn}
          </button>

          <button className="btn btn-blue" onClick={() => { 
            gsRef.current.isPlaying = false;
            gsRef.current.gameMode = 'single'; 
            gsRef.current.roomCode = null; 
            setLobbyState('main'); 
            setScreen('menu');
            leaveLobby(); 
          }} style={{ flex: 1, fontSize: '22px' }}>
            {text.menuBtn}
          </button>

        </div>
      </div>
    </div>
  );
}