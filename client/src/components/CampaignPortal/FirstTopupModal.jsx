// src/components/CampaignPortal/FirstTopupModal.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './CampaignPortal.module.css'; 
import { FIRST_TOPUP_REWARD, AIRCRAFTS } from '../../constants';

// --- ĐỒNG BỘ SVG ICONS ---
const Icons = {
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>,
  Gem: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>
};

// Hàm định dạng số liệu gọn gàng
const formatCompactNumber = (number) => {
  if (number < 1000) return number.toString();
  const suffixes = ["", "K", "M", "B", "T"];
  const suffixNum = Math.floor(("" + number).length / 3);
  let shortValue = parseFloat((suffixNum !== 0 ? (number / Math.pow(1000, suffixNum)) : number).toPrecision(3));
  if (shortValue % 1 !== 0) shortValue = shortValue.toFixed(1);
  return shortValue + suffixes[suffixNum];
};

export default function FirstTopupModal({ isOpen, onClose, lang, onGoToShop }) {
  if (!isOpen) return null;

  // Truy xuất dữ liệu thực tế từ constants
  const rewardAircraft = AIRCRAFTS.find(a => a.id === FIRST_TOPUP_REWARD.aircraftId) || AIRCRAFTS[0];

  return (
    <AnimatePresence>
      <motion.div 
        className={styles.popupOverlay} 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ zIndex: 1000 }} 
      >
        <motion.div 
          className={styles.profileModal} 
          style={{ maxWidth: '420px', padding: '0', overflow: 'hidden' }}
          initial={{ scale: 0.9, y: 50 }} 
          animate={{ scale: 1, y: 0 }} 
          exit={{ scale: 0.9, y: 50 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* NÚT ĐÓNG */}
          <button className={styles.closeModalBtn} onClick={onClose} style={{ zIndex: 100 }}>✕</button>
          
          {/* HEADER BANNER - Sử dụng ảnh tàu động */}
          <div style={{
             width: '100%', height: '180px', 
             background: `url(${rewardAircraft.imgHq || rewardAircraft.imgTop}) no-repeat center center`, 
             backgroundSize: 'cover', 
             position: 'relative', borderBottom: '2px solid #ff47a3'
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,14,28,1) 5%, transparent 100%)' }}></div>
            <h2 style={{ 
               position: 'absolute', bottom: '15px', width: '100%', textAlign: 'center', 
               margin: 0, color: '#ff47a3', fontSize: '32px', fontFamily: 'var(--font-ui)', 
               fontWeight: '900', textShadow: '0 0 15px #ff47a3', letterSpacing: '2px'
            }}>
               {lang === 'vi' ? 'QUÀ NẠP LẦN ĐẦU' : 'FIRST TOP-UP BONUS'}
            </h2>
          </div>

          {/* CHI TIẾT PHẦN THƯỞNG */}
          <div style={{ padding: '20px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
            <p style={{ margin: 0, color: '#e2e8f0', textAlign: 'center', fontSize: '16px', lineHeight: '1.4' }}>
              {lang === 'vi' 
                ? 'Nạp mệnh giá bất kỳ để nhận ngay Phi cơ Huyền Thoại và bộ tài nguyên siêu cấp!' 
                : 'Top-up any amount to claim a Legendary Aircraft and starter resources!'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', width: '100%' }}>
               {/* Item 1: Phi cơ (Đọc từ constants) */}
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                 <div style={{ width: '70px', height: '70px', borderRadius: '12px', border: '2px solid #facc15', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 15px rgba(250, 204, 21, 0.3)' }}>
                    <img 
                      src={rewardAircraft.imgSrc || rewardAircraft.imgHq} 
                      alt="Aircraft" 
                      style={{ width: '90%', height: '90%', objectFit: 'contain' }} 
                      onError={(e) => { e.target.onerror = null; e.target.src = '/images/no_image.png'; }}
                    />
                 </div>
                 <span style={{ fontSize: '13px', color: '#facc15', fontWeight: 'bold', textAlign: 'center' }}>
                   {rewardAircraft.name[lang] || rewardAircraft.name.en}
                 </span>
               </div>
               
               {/* Item 2: Kim Cương (Đọc từ constants + Dùng SVG Icon) */}
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                 <div style={{ width: '70px', height: '70px', borderRadius: '12px', border: '1px solid #c084fc', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#c084fc' }}>
                    <div style={{ width: '35px', height: '35px' }}><Icons.Gem /></div>
                 </div>
                 <span style={{ fontSize: '13px', color: '#c084fc', fontWeight: 'bold', textAlign: 'center' }}>
                   +{formatCompactNumber(FIRST_TOPUP_REWARD.gems)} GEMS
                 </span>
               </div>

               {/* Item 3: Tiền Vàng (Đọc từ constants + Dùng SVG Icon) */}
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                 <div style={{ width: '70px', height: '70px', borderRadius: '12px', border: '1px solid #fb923c', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fb923c' }}>
                    <div style={{ width: '35px', height: '35px' }}><Icons.Coin /></div>
                 </div>
                 <span style={{ fontSize: '13px', color: '#fb923c', fontWeight: 'bold', textAlign: 'center' }}>
                   +{formatCompactNumber(FIRST_TOPUP_REWARD.coins)} COINS
                 </span>
               </div>
            </div>

            {/* NÚT CHUYỂN HƯỚNG */}
            <motion.button 
               whileTap={{ scale: 0.95 }}
               onClick={onGoToShop}
               style={{
                 width: '90%', padding: '15px', background: 'linear-gradient(90deg, #ff47a3, #c084fc)',
                 border: 'none', borderRadius: '30px', color: '#fff', fontSize: '20px', 
                 fontFamily: 'var(--font-ui)', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer',
                 boxShadow: '0 0 20px rgba(255, 71, 163, 0.5)'
               }}
            >
               {lang === 'vi' ? 'ĐẾN CỬA HÀNG NGAY' : 'GO TO SHOP NOW'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}