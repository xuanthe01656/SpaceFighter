import React from 'react';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { t } from '../utils/translations';

export default function Menu({ currentUser, uiUpdates, topRecords, startGame, setScreen, loginWithGoogle, loginWithApple, logout, deleteAccount, openShop, openLeaderboard, lang, toggleLanguage}) {
  const text = t[lang];
  const platform = Capacitor.getPlatform();
  
  return (
    <div className="ui-layer">
      {/* KHU VỰC GÓC TRÊN BÊN PHẢI: Chứa User, Nút Thoát và Nút Đổi Ngôn Ngữ */}
      <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', zIndex: 100, maxWidth: '55vw' }}>
        
        {/* NÚT CHUYỂN ĐỔI NGÔN NGỮ */}
        <button 
          onClick={toggleLanguage}
          style={{ 
            background: 'rgba(0,0,0,0.6)', color: '#fff', border: '2px solid #FFD700', 
            borderRadius: '8px', padding: '4px 10px', fontSize: '18px', cursor: 'pointer', 
            fontFamily: "'VT323', monospace", pointerEvents: 'auto' 
          }}
        >
          {lang === 'vi' ? '🇻🇳 VN' : '🇬🇧 EN'}
        </button>

        {currentUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%', alignItems: 'flex-end' }}>
            {/* Thanh User & Logout cũ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '50px', border: '2px solid #55efc4', pointerEvents: 'auto', width: '100%' }}>
              <img src={currentUser.photoURL} alt="avatar" style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
              <span style={{ color: '#fff', fontSize: '18px', fontFamily: "'VT323', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {currentUser.displayName}
              </span>
              <button onClick={logout} style={{ background: '#ff4757', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', padding: '2px 8px', fontFamily: "'VT323', monospace", flexShrink: 0 }}>
                {text.logout}
              </button>
            </div>
            
            {/* NÚT XÓA TÀI KHOẢN MỚI */}
            <button 
              onClick={deleteAccount} 
              style={{ background: 'transparent', color: '#ff4757', border: 'none', textDecoration: 'underline', fontSize: '14px', cursor: 'pointer', fontFamily: "'VT323', monospace", pointerEvents: 'auto', paddingRight: '10px' }}
            >
              {lang === 'vi' ? 'Xóa tài khoản' : 'Delete Account'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn" onClick={loginWithGoogle} style={{ pointerEvents: 'auto', background: '#fff', color: '#333', border: '2px solid #ddd', borderRadius: '25px', padding: '8px 15px', fontSize: '16px', fontFamily: "'VT323', monospace", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
              <img src="/images/google.png" alt="Google" style={{ width: '18px' }} />
              {text.login}
            </button>
            
            {platform === 'ios' && (
              <button className="btn" onClick={loginWithApple} style={{ pointerEvents: 'auto', background: '#000', color: '#fff', border: '2px solid #555', borderRadius: '25px', padding: '8px 15px', fontSize: '16px', fontFamily: "'VT323', monospace", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                🍎 Đăng nhập Apple
              </button>
            )}
          </div>
        )}
      </div>

      {currentUser && (
        <div className="hud-container" style={{ 
          position: 'absolute', 
          top: 'min(3vh, 20px)', 
          left: 'min(3vw, 20px)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px', 
          pointerEvents: 'auto',
          zIndex: 100 
        }}>
          {/* Box hiển thị Xu */}
          <div className="hud-item coin-box" style={{ 
            background: 'rgba(0,0,0,0.7)', padding: '5px 12px', borderRadius: '12px', 
            color: '#FFD700', fontSize: 'clamp(18px, 4vw, 24px)', border: '2px solid #FFD700', 
            display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 10px rgba(255, 215, 0, 0.2)',
            fontFamily: "'VT323', monospace"
          }}>
            <span className="pixel-icon icon-coin"></span>
            <span>{uiUpdates.coins || 0}</span>
          </div>

          {/* Box hiển thị Mạng/Tim */}
          <div className="hud-item life-box" style={{ 
            background: 'rgba(0,0,0,0.7)', padding: '5px 12px', borderRadius: '12px', 
            color: '#ff4757', fontSize: 'clamp(18px, 4vw, 24px)', border: '2px solid #ff4757', 
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', 
            boxShadow: '0 0 10px rgba(255, 71, 87, 0.2)', fontFamily: "'VT323', monospace", minWidth: '100px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <span className="pixel-icon icon-heart"></span>
              <span>{uiUpdates.isVIP ? '∞' : `${uiUpdates.lives || 0}/10`}</span>
            </div>
            
            {uiUpdates.nextLifeTime && (
              <div style={{ fontSize: 'clamp(10px, 2.5vw, 14px)', color: '#ccc', width: '100%', textAlign: 'right', marginTop: '-2px', opacity: 0.9 }}>
                {uiUpdates.nextLifeTime}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="title">ASTRO CAT 5</div>
      <div className="subtitle">Ultimate Online</div>

      <div className="menu-grid">
        <button className="btn btn-red" onClick={() => startGame('single')}>{text.playSingle}</button>
        <button className="btn btn-purple" onClick={() => {
          if (!currentUser) {
            toast.error(text.loginReqPvP, { duration: 4000 });
            return;
          }
          setScreen('lobby');
        }}>{text.playOnline}</button>
        <button className="btn btn-blue" onClick={openShop}>{text.shop}</button>
        <button className="btn btn-green" onClick={() => openLeaderboard('single')}>{text.leaderboard}</button>
        
        {/* NÚT TẢI APP - CHỈ HIỂN THỊ TRÊN WEB */}
        {!Capacitor.isNativePlatform() && (
          <button 
            className="btn" 
            onClick={() => window.open("https://play.google.com/store/apps/details?id=com.ban.astrocat", "_blank")}
            style={{ 
              marginTop: '15px', background: 'linear-gradient(45deg, #2ed573, #7bed9f)', 
              color: '#000', border: '2px solid #fff', boxShadow: '0 0 15px rgba(46, 213, 115, 0.5)'
            }}
          >
            {text.downloadApp}
          </button>
        )}
      </div>

      <div style={{ marginTop: '60px', fontSize: '22px', textShadow: '2px 2px 4px #000', background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '10px', border: '1px solid #555' }}>
        <div style={{ marginBottom: '8px', color: '#fff' }}>{text.topSingle} <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{topRecords.single}</span></div>
        <div style={{ color: '#fff' }}>{text.topPvP} <span style={{ color: '#00FFFF', fontWeight: 'bold' }}>{topRecords.pvp}</span></div>
      </div>
    </div>
  );
}