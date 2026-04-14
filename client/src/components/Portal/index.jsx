import React from 'react';
import { Capacitor } from '@capacitor/core';
// Lưu ý: Thêm một dấu '../' nữa vì chúng ta đang ở sâu hơn 1 thư mục
import { t } from '../../utils/translations'; 
import styles from './Portal.module.css';

export default function Portal({ 
  setScreen, currentUser, loginWithGoogle, loginWithApple, 
  logout, deleteAccount, lang, toggleLanguage 
}) {
  const platform = Capacitor.getPlatform();

  return (
    <div className={styles.container}>
      
      {/* HEADER: ĐĂNG NHẬP & NGÔN NGỮ */}
      <div className={styles.header}>
        <button onClick={toggleLanguage} style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: '2px solid #FFD700', borderRadius: '8px', padding: '4px 10px', fontSize: '18px', cursor: 'pointer', fontFamily: "'VT323', monospace", pointerEvents: 'auto' }}>
          {lang === 'vi' ? '🇻🇳 VN' : '🇬🇧 EN'}
        </button>

        {currentUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '50px', border: '2px solid #55efc4', pointerEvents: 'auto', width: '100%' }}>
              <img src={currentUser.photoURL} alt="avatar" style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
              <span style={{ color: '#fff', fontSize: '18px', fontFamily: "'VT323', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{currentUser.displayName}</span>
              <button onClick={logout} style={{ background: '#ff4757', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', padding: '2px 8px', fontFamily: "'VT323', monospace", flexShrink: 0 }}>
                {lang === 'vi' ? 'Thoát' : 'Logout'}
              </button>
            </div>
            <button onClick={deleteAccount} style={{ background: 'transparent', color: '#ff4757', border: 'none', textDecoration: 'underline', fontSize: '14px', cursor: 'pointer', fontFamily: "'VT323', monospace", pointerEvents: 'auto', paddingRight: '10px' }}>
              {lang === 'vi' ? 'Xóa tài khoản' : 'Delete Account'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {platform !== 'ios' && (
              <button onClick={loginWithGoogle} style={{ pointerEvents: 'auto', background: '#fff', color: '#333', border: '2px solid #ddd', borderRadius: '25px', padding: '8px 15px', fontSize: '16px', fontFamily: "'VT323', monospace", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src="/images/google.png" alt="Google" style={{ width: '18px' }} />
                {lang === 'vi' ? 'Đăng nhập Google' : 'Login Google'}
              </button>
            )}
            {platform === 'ios' && (
              <button onClick={loginWithApple} style={{ pointerEvents: 'auto', background: '#000', color: '#fff', border: '2px solid #555', borderRadius: '25px', padding: '8px 15px', fontSize: '16px', fontFamily: "'VT323', monospace", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🍎 {lang === 'vi' ? 'Đăng nhập Apple' : 'Login Apple'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* TÊN GAME */}
      <h1 className={styles.title}>ASTRO CAT 2.0</h1>

      {/* 2 CÁNH CỬA */}
      <div className={styles.cardsWrapper}>
        
        {/* CỬA 1: VÔ CỰC (Cách gộp 2 class trong CSS Module) */}
        <div className={`portal-card ${styles.card} ${styles.cardEndless}`} onClick={() => setScreen('menu')}>
          <div className={styles.icon}>♾️</div>
          <h2 className={styles.cardTitle} style={{ color: '#0abde3' }}>
            {lang === 'vi' ? 'CHẾ ĐỘ VÔ CỰC' : 'ENDLESS MODE'}
          </h2>
          <p className={styles.desc}>
            {lang === 'vi' ? 'Bay lượn qua các chướng ngại vật, nhặt xu, thi đấu PvP trực tuyến và leo Rank.' : 'Fly through pipes, collect coins, play online PvP and climb the Leaderboard.'}
          </p>
        </div>

        {/* CỬA 2: CHIẾN DỊCH */}
        <div className={`portal-card ${styles.card} ${styles.cardCampaign}`} onClick={() => setScreen('hq')}>
          <div className={styles.icon}>🚀</div>
          <h2 className={styles.cardTitle} style={{ color: '#ff4757' }}>
            {lang === 'vi' ? 'CHIẾN DỊCH' : 'CAMPAIGN'}
          </h2>
          <p className={styles.desc}>
            {lang === 'vi' ? 'Quản lý Phi cơ, tuyển mộ Phi công, nâng cấp súng ống và tiêu diệt Boss.' : 'Manage Aircrafts, recruit Pilots, upgrade weapons and defeat Bosses.'}
          </p>
        </div>

      </div>
    </div>
  );
}