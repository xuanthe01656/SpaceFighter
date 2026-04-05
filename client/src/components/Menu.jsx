import React , { useState } from 'react';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { t } from '../utils/translations';

export default function Menu({ currentUser, uiUpdates, topRecords, startGame, setScreen, loginWithGoogle, loginWithApple, logout, deleteAccount, openShop, openLeaderboard, lang, toggleLanguage}) {
  const text = t[lang];
  const platform = Capacitor.getPlatform();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="ui-layer">
      {/* NÚT HƯỚNG DẪN (?) GÓC TRÊN BÊN TRÁI */}
      <button 
        onClick={() => setShowHelp(true)}
        style={{ 
          position: 'absolute', top: '15px', left: '15px', zIndex: 150,
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)', color: '#0abde3',
          border: '2px solid #0abde3', fontSize: '24px',
          fontWeight: 'bold', cursor: 'pointer', fontFamily: "'VT323', monospace",
          pointerEvents: 'auto', boxShadow: '0 0 10px rgba(10, 189, 227, 0.4)'
        }}
      >
        ?
      </button>
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
          pointerEvents: 'none',
          zIndex: 100 
        }}>
          {/* Box hiển thị Xu */}
          <div className="hud-item coin-box" style={{ 
            marginTop: '45px',
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

      {/* --- KHU VỰC NỘI DUNG CHÍNH (TỰ ĐỘNG CUỘN NẾU MÀN HÌNH QUÁ NGẮN) --- */}
        <div className="scrollable-layer" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
          width: '100%', height: '100%', pointerEvents: 'auto', overflowY: 'auto',
          paddingTop: 'clamp(140px, 22vh, 180px)', paddingBottom: '30px', boxSizing: 'border-box'
        }}>
          
          {/* Lệnh marginTop: 'auto' giúp tự động đẩy cả cụm này xuống giữa màn hình nếu màn hình dài */}
          <div className="title" style={{ marginTop: 'auto', fontSize: 'clamp(45px, 10vw, 70px)' }}>ASTRO CAT 5</div>
          <div className="subtitle" style={{ fontSize: 'clamp(16px, 4vw, 24px)', marginBottom: 'clamp(15px, 3vh, 30px)' }}>Ultimate Online</div>

          <div className="menu-grid" style={{ marginBottom: '10px' }}>
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
                  marginTop: 'clamp(5px, 2vh, 15px)', background: 'linear-gradient(45deg, #2ed573, #7bed9f)', 
                  color: '#000', border: '2px solid #fff', boxShadow: '0 0 15px rgba(46, 213, 115, 0.5)'
                }}
              >
                {text.downloadApp}
              </button>
            )}
          </div>

          <div style={{ 
            marginTop: 'clamp(20px, 4vh, 60px)', 
            marginBottom: 'auto', // Giữ content ở giữa màn hình thay vì trôi tuột xuống đáy
            fontSize: 'clamp(16px, 4vw, 22px)', textShadow: '2px 2px 4px #000', 
            background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '10px', border: '1px solid #555',
            width: '90%', maxWidth: '400px'
          }}>
            <div style={{ marginBottom: '8px', color: '#fff' }}>{text.topSingle} <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{topRecords.single}</span></div>
            <div style={{ color: '#fff' }}>{text.topPvP} <span style={{ color: '#00FFFF', fontWeight: 'bold' }}>{topRecords.pvp}</span></div>
          </div>
          
        </div>
      {/* ========================================= */}
      {/* POPUP HƯỚNG DẪN CƠ CHẾ GAME               */}
      {/* ========================================= */}
      {showHelp && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 9999, pointerEvents: 'auto', backdropFilter: 'blur(3px)'
        }}>
           <div style={{
             width: '90%', maxWidth: '500px', background: '#0a192f',
             border: '3px solid #0abde3', borderRadius: '15px',
             padding: '20px', display: 'flex', flexDirection: 'column',
             maxHeight: '80vh', boxShadow: '0 0 25px rgba(10, 189, 227, 0.5)'
           }}>
              {/* Header của Bảng */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a365d', paddingBottom: '10px', marginBottom: '15px', flexShrink: 0 }}>
                <div style={{ fontSize: 'clamp(24px, 6vw, 30px)', color: '#0abde3', fontWeight: 'bold', textShadow: '2px 2px 0 #000' }}>
                  {lang === 'vi' ? 'HƯỚNG DẪN TÂN THỦ' : 'HOW TO PLAY'}
                </div>
                <button onClick={() => setShowHelp(false)} style={{ background: '#ff4757', color: '#fff', border: '2px solid #fff', borderRadius: '50%', width: '35px', height: '35px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 5px rgba(255,71,87,0.5)' }}>
                  ✕
                </button>
              </div>

              {/* Nội dung cuộn */}
              <div className="scrollable-layer" style={{ overflowY: 'auto', color: '#fff', fontSize: 'clamp(16px, 4vw, 20px)', textAlign: 'left', lineHeight: '1.4', paddingRight: '10px' }}>
                
                <div style={{ marginBottom: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                   <div style={{ color: '#FFD700', fontSize: '24px', marginBottom: '5px', fontWeight: 'bold' }}>🎮 {lang === 'vi' ? 'Cách Chơi' : 'Controls'}</div>
                   <div>{lang === 'vi' ? '- Chạm vào màn hình hoặc bấm phím SPACE để nhảy.' : '- Tap screen or press SPACE to jump.'}</div>
                   <div>{lang === 'vi' ? '- Né các Cột năng lượng để sống sót và ghi điểm.' : '- Avoid Energy Pipes to survive and score.'}</div>
                </div>

                <div style={{ marginBottom: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                   <div style={{ color: '#FFD700', fontSize: '24px', marginBottom: '10px', fontWeight: 'bold' }}>🎒 {lang === 'vi' ? 'Vật Phẩm (Rơi ngẫu nhiên)' : 'Items (Random Drops)'}</div>
                   
                   <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                     <span style={{ fontSize: '28px', lineHeight: '1' }}>🪙</span>
                     <div>
                       <b style={{ color: '#FFD700' }}>{lang === 'vi' ? 'Đồng Xu:' : 'Coins:'}</b> {lang === 'vi' ? 'Dùng để mua Skin mèo, Bản đồ mới và mua Mạng tại Cửa Hàng. Có thể cày cuốc trong trận hoặc Xem quảng cáo để nhận.' : 'Used to buy Skins, Maps, and Lives in the Shop. Farm in-game or watch Ads.'}
                     </div>
                   </div>
                   
                   <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                     <span style={{ fontSize: '28px', lineHeight: '1' }}>🛡️</span>
                     <div>
                       <b style={{ color: '#00FFFF' }}>{lang === 'vi' ? 'Khiên Năng Lượng:' : 'Energy Shield:'}</b> {lang === 'vi' ? 'Giúp mèo Bất Tử trong vài giây. Tự do đâm xuyên qua các cột chướng ngại vật.' : 'Grants Invincibility for a few seconds. Crash through pipes safely.'}
                     </div>
                   </div>
                   
                   <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
                     <span style={{ fontSize: '28px', lineHeight: '1' }}>⭐</span>
                     <div>
                       <b style={{ color: '#2ed573' }}>{lang === 'vi' ? 'Ngôi Sao:' : 'Star:'}</b> {lang === 'vi' ? 'Lập tức cộng ngay 5 ĐIỂM vào thành tích của bạn.' : 'Instantly adds +5 POINTS to your score.'}
                     </div>
                   </div>
                </div>

                <div style={{ marginBottom: '5px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                   <div style={{ color: '#ff4757', fontSize: '24px', marginBottom: '5px', fontWeight: 'bold' }}>❤️ {lang === 'vi' ? 'Mạng (Lives)' : 'Lives'}</div>
                   <div style={{ marginBottom: '5px' }}>{lang === 'vi' ? '- Mỗi lần chết mất 1 mạng. Hệ thống tự hồi 1 mạng sau mỗi 2 Tiếng.' : '- Lose 1 life per death. Auto-regenerates 1 life every 2 hours.'}</div>
                   <div>{lang === 'vi' ? '- Nếu hết mạng, bạn có thể vào Cửa Hàng mua bằng Xu, xem Quảng cáo để lấy mạng, hoặc Mua Gói VIP để BẤT TỬ MẠNG vĩnh viễn.' : '- If out of lives, buy with Coins, watch Ads, or buy VIP for INFINITE lives.'}</div>
                </div>
                
              </div>
           </div>
        </div>
      )}
    </div>
  );
}