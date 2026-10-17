import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { secureStorage } from '../../utils/storageHelper';
import styles from './Portal.module.css';

export default function Portal({ 
  gsRef, setScreen, currentUser, loginWithGoogle, loginWithApple, 
  logout, lang, toggleLanguage, renamePlayer 
}) {
  const platform = Capacitor.getPlatform();
  // Public assets must resolve through the deployment base, not relative
  // to the CSS module's src/components/Portal directory. Works with Vite's
  // base:'./' and Capacitor's local origin as well as hosted subpaths.
  const assetBase = import.meta.env.BASE_URL;
  const portalBackgrounds = {
    '--portal-bg-landscape': `url("${assetBase}images/portal_landscape.png")`,
    '--portal-bg-portrait': `url("${assetBase}images/portal_portrait.png")`,
  };
  
  // Các trạng thái của sảnh: 'login' (chưa đăng nhập) -> 'name' (nhập tên) -> 'ready' (sẵn sàng vào game)
  const [step, setStep] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Khi có user đăng nhập, chuyển sang bước Đặt tên và lấy tên mặc định từ Auth
  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName || gsRef.current.myName || '');
      setStep('name');
    } else {
      setStep('login');
    }
  }, [currentUser, gsRef]);

  // Bộ tạo tên ngẫu nhiên chuẩn Viễn tưởng (Sci-fi)
  const generateRandomName = () => {
    const adjs = ['Astro', 'Nova', 'Cosmic', 'Star', 'Cyber', 'Neon', 'Dark', 'Light', 'Space', 'Galactic', 'Iron', 'Phantom'];
    const nouns = ['Cat', 'Wolf', 'Fox', 'Dragon', 'Hunter', 'Striker', 'Titan', 'Viper', 'Ghost', 'Rider'];
    const adj = adjs[Math.floor(Math.random() * adjs.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9999);
    setDisplayName(`${adj}${noun}${num}`);
  };

  // Bộ lọc từ ngữ vi phạm (Profanity Filter)
  const checkBadWords = (name) => {
    const badWords = ['admin', 'fuck', 'shit', 'bitch', 'lon', 'cac', 'cc', 'dm', 'vcl', 'wtf', 'loz'];
    const lowerName = name.toLowerCase();
    return badWords.some(word => lowerName.includes(word));
  };

  // Xử lý xác nhận tên
  const handleConfirmName = async () => {
    const trimmedName = displayName.trim();
    
    // 1. Kiểm tra độ dài
    if (trimmedName.length < 3 || trimmedName.length > 15) {
      toast.error(lang === 'vi' ? 'Tên danh xưng phải từ 3 - 15 ký tự!' : 'Identity must be 3-15 chars!');
      return;
    }

    // 2. Kiểm tra từ bậy
    if (checkBadWords(trimmedName)) {
      toast.error(lang === 'vi' ? 'Tên chứa ký tự hoặc từ ngữ không hợp lệ!' : 'Invalid words detected!');
      return;
    }

    setIsLoading(true);
    try {
      // API validates player names. Client must not list or write users/*.
      await renamePlayer(trimmedName);

      gsRef.current.myName = trimmedName;
      toast.success(lang === 'vi' ? 'Định danh Phi công thành công!' : 'Identity Confirmed!');
      setStep('ready');

    } catch (error) {
      console.error(error);
      toast.error(lang === 'vi' ? 'Máy chủ đang bận, thử lại sau!' : 'Server busy, try again later!');
    }
    setIsLoading(false);
  };

  const handleGuestPlay = () => {
    // 1. Gán ID ngẫu nhiên cho khách nếu chưa có
    if (!gsRef.current.deviceId || gsRef.current.deviceId === 'unknown') {
      gsRef.current.deviceId = `GUEST-${Math.floor(Math.random() * 1000000)}`;
    }
    
    // 2. Gán tên hiển thị mặc định
    gsRef.current.myName = lang === 'vi' ? 'Phi Công Lạ Mặt' : 'Unknown Pilot';
    
    // 3. Tải lại dữ liệu Local (nếu người này đã từng chơi Khách trước đó)
    const guestCampaign = secureStorage.getItem('astro_guest_campaign');
    if (guestCampaign && typeof guestCampaign === 'object') {
      gsRef.current.campaignData = guestCampaign;
    }
    
    // 4. Chuyển thẳng vào game
    setScreen('campaign_portal');
    toast.success(lang === 'vi' ? 'Khởi động chế độ Chơi Ngay!' : 'Guest Mode Initialized!');
  };

  // Hoạt ảnh
  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.15 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { type: 'spring' } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className={styles.container}>
      <div className={styles.backgroundLayer} style={portalBackgrounds} />
      
      <div className={styles.topNav}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={toggleLanguage} className={styles.langBtn}>
          {lang === 'vi' ? '🇻🇳 TIẾNG VIỆT' : '🇬🇧 ENGLISH'}
        </motion.button>
        {currentUser && (
           <button onClick={logout} className={styles.logoutBtn}>
             {lang === 'vi' ? 'ĐĂNG XUẤT' : 'LOGOUT'}
           </button>
        )}
      </div>

      <motion.h1 variants={itemVariants} className={styles.title}>
        SPACE FIGHTER 4.0
      </motion.h1>
      <motion.p variants={itemVariants} className={styles.subtitle}>GALAXY WARS</motion.p>

      {/* KHUNG ĐĂNG NHẬP (Lúc chưa có User) */}
      {step === 'login' && (
        <motion.div variants={itemVariants} className={styles.authBox}>
          <h2 className={styles.boxTitle}>{lang === 'vi' ? 'THIẾT LẬP KẾT NỐI' : 'ESTABLISH CONNECTION'}</h2>
          
          {platform !== 'ios' && (
            <button onClick={loginWithGoogle} className={`${styles.loginBtn} ${styles.googleBtn}`}>
              <img src="/images/google.png" alt="G" className={styles.loginIcon} /> 
              {lang === 'vi' ? 'TIẾP TỤC VỚI GOOGLE' : 'CONTINUE WITH GOOGLE'}
            </button>
          )}

          {platform === 'ios' && (
            <button onClick={loginWithApple} className={`${styles.loginBtn} ${styles.appleBtn}`}>
              🍎 {lang === 'vi' ? 'ĐĂNG NHẬP APPLE ID' : 'SIGN IN WITH APPLE'}
            </button>
          )}
          
          <button 
             onClick={handleGuestPlay} 
             className={`${styles.loginBtn} ${styles.guestBtn}`}
             style={{ background: 'transparent', border: '1px solid #00e5ff', color: '#00e5ff', marginTop: '10px' }}
          >
              {lang === 'vi' ? 'CHƠI NGAY (KHÔNG LƯU MẠNG)' : 'GUEST PLAY (OFFLINE)'}
          </button>

          <div className={styles.guestNote}>
            {lang === 'vi' ? 'Chú ý: Dữ liệu Khách có thể bị mất khi cài lại thiết bị hoặc gỡ ứng dụng.' : 'Warning: Guest data may be lost upon app uninstallation.'}
          </div>
        </motion.div>
      )}

      {/* KHUNG ĐẶT TÊN (Đã đăng nhập) */}
      {step === 'name' && (
        <motion.div variants={itemVariants} className={styles.authBox}>
          <h2 className={styles.boxTitle}>{lang === 'vi' ? 'HỒ SƠ PHI CÔNG' : 'PILOT DOSSIER'}</h2>
          
          <div className={styles.inputGroup}>
            <input 
              type="text" 
              className={styles.nameInput}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={lang === 'vi' ? 'Nhập mã định danh...' : 'Enter your codename...'}
              maxLength={15}
            />
            <button className={styles.diceBtn} onClick={generateRandomName} title="Random">
              🎲
            </button>
          </div>

          <button 
            className={styles.confirmBtn} 
            onClick={handleConfirmName}
            disabled={isLoading}
          >
            {isLoading ? (lang === 'vi' ? 'ĐANG ĐỒNG BỘ DỮ LIỆU...' : 'SYNCING DATA...') : (lang === 'vi' ? 'HOÀN TẤT ĐĂNG KÝ' : 'FINISH REGISTRATION')}
          </button>
        </motion.div>
      )}

      {/* KHUNG VÀO GAME (Đã hoàn tất tên) */}
      {step === 'ready' && (
        <motion.div variants={itemVariants} className={styles.authBox}>
           <h2 className={styles.welcomeText}>
             {lang === 'vi' ? `XÁC NHẬN, ${displayName}!` : `AFFIRMATIVE, ${displayName}!`}
           </h2>
           <button 
             className={styles.enterGameBtn} 
             onClick={() => setScreen('campaign_portal')}
           >
             {lang === 'vi' ? 'XUẤT KÍCH NGAY' : 'LAUNCH MISSION'}
           </button>
        </motion.div>
      )}

    </motion.div>
  );
}