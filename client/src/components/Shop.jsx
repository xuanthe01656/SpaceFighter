import React, { useState } from 'react'; // Thêm { useState } vào đây
import toast from 'react-hot-toast';
import { SKINS, BACKGROUNDS } from '../constants';
import { Capacitor } from '@capacitor/core';
import { Purchases, PACKAGE_TYPE } from '@revenuecat/purchases-capacitor';
import { t } from '../utils/translations'; // 1. Nhúng từ điển

export default function Shop({ currentUser, uiUpdates, setUIUpdates, gsRef, setScreen, selectSkin, selectBg, saveUserProfile, watchAd, isWatchingAd, lang }) {
  // 2. Lấy bộ từ vựng theo ngôn ngữ hiện tại
  const text = t[lang] || t['vi'];
  const [isProcessing, setIsProcessing] = useState(false);
  // Logic mua vật phẩm đã được chuyển lên Server bảo mật
  const handlePurchase = async (type, item) => {
    const gs = gsRef.current;
    
    // 1. Nếu đã sở hữu -> Chỉ việc trang bị
    const inventory = gs.inventory?.[type === 'skin' ? 'skins' : 'bgs'] || [];
    if (inventory.includes(item.id)) {
      if (type === 'skin') selectSkin(item.id);
      else selectBg(item.id);
      await saveUserProfile();
      return;
    }

    // 2. Nếu chưa sở hữu -> Bắt buộc phải đăng nhập
    if (!currentUser) {
      toast.error(t[lang]?.reqLogin || "Vui lòng đăng nhập để mua!");
      return;
    }

    const price = Number(item.price);
    if (Number(gs.coins) < price) {
      toast.error(t[lang]?.errNotEnoughCoins || "Không đủ Xu!");
      return;
    }

    const loadingToast = toast.loading(t[lang]?.processingPurchase || "Đang xử lý giao dịch...");

    try {
      // BƯỚC QUAN TRỌNG Ở CLIENT: Lấy Token định danh
      const idToken = await currentUser.getIdToken(true);
      
      const API_URL = import.meta.env.VITE_SOCKET_URL || '';

      // Gọi lệnh fetch (gửi thư) lên Server thay vì tự xử lý
      const response = await fetch(`${API_URL}/api/shop/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: idToken,
          type: type,
          itemId: item.id
        })
      });

      const data = await response.json(); // Ở Client dùng response.json() để đọc data

      if (!response.ok) {
        throw new Error(data.error || "Giao dịch thất bại");
      }

      // --- SERVER TRẢ VỀ THÀNH CÔNG ---
      toast.dismiss(loadingToast);
      const itemName = typeof item.name === 'object' ? (item.name[lang] || item.name['vi']) : item.name;
      toast.success(`${t[lang]?.successOwned || 'Đã sở hữu'} ${itemName}!`);

      // Cập nhật lại UI và Ref cục bộ cho đồng bộ với Server
      gs.coins = data.newCoins;
      if (type === 'skin') {
        gs.inventory.skins.push(item.id);
        selectSkin(item.id);
      } else {
        gs.inventory.bgs.push(item.id);
        selectBg(item.id);
      }

      setUIUpdates(prev => ({...prev, coins: gs.coins}));

    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(`Lỗi: ${error.message}`);
    }
  };

  const handleBuyVIP = async () => {
    if (!currentUser) {
      toast.error(text.errLoginVIP);
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    
    // NẾU LÀ WEB: Báo lỗi và hiện nút tải App (Giữ nguyên của bạn)
    if (!isNative) {
      toast((t) => (
        <div style={{ textAlign: 'center', padding: '5px' }}>
          <div style={{ fontSize: '30px', marginBottom: '5px' }}>📱</div>
          <div style={{ fontSize: '16px', marginBottom: '10px', color: '#FFD700' }}>
            <b>{text.errAppOnly}</b>
          </div>
          <div style={{ fontSize: '14px', marginBottom: '15px', color: '#ccc' }}>
            {text.errAppOnlyDesc}
          </div>
          <button 
            onClick={() => {
              window.open("https://play.google.com/store/apps/details?id=com.ban.astrocat", "_blank"); 
              toast.dismiss(t.id);
            }}
            style={{ background: '#2ed573', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', width: '100%', fontFamily: "'VT323', monospace" }}
          >
            {text.downloadAppNow}
          </button>
        </div>
      ), { duration: 6000, style: { background: '#1a1a2e', border: '2px solid #2ed573' } });
      return; 
    }
    
    const loadingToast = toast.loading(text.connectingPlay);
    
    try {
      const offerings = await Purchases.getOfferings();
      
      // SỬA Ở ĐÂY: Gọi đích danh gói lifetime thay vì availablePackages[0]
      if (offerings.current && offerings.current.lifetime) {
        const vipPackage = offerings.current.lifetime;
        toast.dismiss(loadingToast);
        
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: vipPackage });

        if (typeof customerInfo.entitlements.active['vip_access'] !== "undefined") {
          gsRef.current.isVIP = true;
          gsRef.current.lives = '∞'; 
          gsRef.current.livesUpdatedAt = null;

          setUIUpdates(prev => ({ ...prev, isVIP: true, lives: '∞', nextLifeTime: null }));
          await saveUserProfile(); 
          toast.success(text.vipSuccess, { duration: 5000 });
        }
      } else {
        toast.dismiss(loadingToast);
        toast.error(text.vipNotReady);
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      if (!e.userCancelled) {
        toast.error(`${text.errPayment} ${e.message}`);
        console.error("Purchase Error:", e);
      }
    }
  };

  // THÊM HÀM KHÔI PHỤC NGAY BÊN DƯỚI
  const handleRestorePurchases = async () => {
    const loadingToast = toast.loading(text.connectingPlay || 'Đang khôi phục...');
    try {
      const result = await Purchases.restorePurchases();
      
      // Hỗ trợ cả 2 chuẩn dữ liệu của RevenueCat (Có hoặc không bọc trong customerInfo)
      const info = result.customerInfo ? result.customerInfo : result;

      // Dùng dấu ?. để chống sập App nếu entitlements bị rỗng/thiếu
      if (info?.entitlements?.active?.['vip_access']) {
        
        gsRef.current.isVIP = true;
        gsRef.current.lives = '∞'; 
        gsRef.current.livesUpdatedAt = null;
        setUIUpdates(prev => ({ ...prev, isVIP: true, lives: '∞', nextLifeTime: null }));
        
        await saveUserProfile(); 
        toast.dismiss(loadingToast);
        toast.success(text.vipSuccess || 'Khôi phục thành công!');
        
      } else {
        toast.dismiss(loadingToast);
        toast.error(text.vipNotReady || 'Không tìm thấy gói VIP nào.');
        console.log("Dữ liệu trả về từ Google:", JSON.stringify(result)); // In ra để dễ dò lỗi nếu cần
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error(`${text.errPayment || 'Lỗi:'} ${e.message}`);
    }
  };

  return (
    <div className="ui-layer" style={{ background: 'rgba(0, 8, 20, 0.95)', padding: 'clamp(10px, 3vw, 20px) 0', boxSizing: 'border-box' }}>
      
      {/* BẢNG CHÍNH (PANEL STYLE) */}
      <div style={{ 
        width: '95%', maxWidth: '950px', background: '#0a192f', borderRadius: '20px', 
        border: '3px solid #FFD700', display: 'flex', flexDirection: 'column', 
        maxHeight: '95vh', boxShadow: '0 0 15px rgba(255, 215, 0, 0.5)', 
        pointerEvents: 'auto', boxSizing: 'border-box' 
      }}>
        
        {/* HEADER CỐ ĐỊNH */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a365d', padding: 'clamp(10px, 3vw, 15px) clamp(15px, 4vw, 20px)', flexShrink: 0, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 'clamp(22px, 6vw, 30px)', color: '#FFD700', fontWeight: 'bold', textShadow: '2px 2px 0 #000', fontFamily: "'VT323', monospace", margin: 0, paddingRight: '10px' }}>
            {text.shopTitle}
          </div>
          <button onClick={() => setScreen('menu')} className="btn-close" style={{ position: 'static', width: '40px', height: '40px', flexShrink: 0 }}>✕</button>
        </div>

        {/* NỘI DUNG CUỘN */}
        <div className="scrollable-layer" style={{ overflowY: 'auto', flex: 1, padding: 'clamp(15px, 4vw, 20px) clamp(15px, 4vw, 20px) 70px clamp(15px, 4vw, 20px)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' }}>
          
          {/* HIỂN THỊ TÀI SẢN */}
          <div style={{ display: 'flex', gap: 'clamp(10px, 3vw, 20px)', marginBottom: '20px', justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
            <div style={{ background: 'rgba(0,0,0,0.6)', padding: 'clamp(5px, 2vw, 10px) clamp(15px, 4vw, 20px)', borderRadius: '12px', color: '#FFD700', fontSize: 'clamp(20px, 5vw, 24px)', border: '2px solid #FFD700', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, boxSizing: 'border-box' }}>
              <span className="pixel-icon icon-coin"></span>
              <span style={{ fontFamily: "'VT323', monospace", fontWeight: 'bold' }}>{uiUpdates.coins || 0}</span>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.6)', padding: 'clamp(5px, 2vw, 10px) clamp(15px, 4vw, 20px)', borderRadius: '12px', color: '#ff4757', fontSize: 'clamp(20px, 5vw, 24px)', border: '2px solid #ff4757', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, boxSizing: 'border-box' }}>
              <span className="pixel-icon icon-heart"></span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1.2' }}>
                <span style={{ fontFamily: "'VT323', monospace", fontWeight: 'bold' }}>
                  {uiUpdates.isVIP ? '∞' : `${uiUpdates.lives || 0}/10`}
                </span>
                {!uiUpdates.isVIP && uiUpdates.nextLifeTime && <span style={{ fontSize: 'clamp(12px, 3vw, 14px)', color: '#ccc' }}>{uiUpdates.nextLifeTime}</span>}
              </div>
            </div>
          </div>

          {/* === KHU VỰC MUA VIP VÀ KHÔI PHỤC === */}
          <div style={{ width: '100%', maxWidth: '600px', marginBottom: '20px', boxSizing: 'border-box' }}>
            {!uiUpdates.isVIP ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <div onClick={handleBuyVIP} className="shop-item" style={{
                  background: 'linear-gradient(45deg, #FFD700, #ff9f43)',
                  border: '3px solid #fff', borderRadius: '15px', padding: 'clamp(10px, 3vw, 15px)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer', boxShadow: '0 0 20px rgba(255, 215, 0, 0.6)',
                  flexWrap: 'wrap', gap: '10px', boxSizing: 'border-box'
                }}>
                  <div style={{ textAlign: 'left', fontFamily: "'VT323', monospace", flex: 1, minWidth: '150px' }}>
                    <div style={{ fontSize: 'clamp(22px, 6vw, 28px)', color: '#000', fontWeight: 'bold', textShadow: '1px 1px 0 #fff' }}>{text.vipTitle}</div>
                    <div style={{ fontSize: 'clamp(14px, 4vw, 18px)', color: '#222', marginTop: '5px', fontWeight: 'bold', textShadow: 'none', lineHeight: '1.3' }}>
                      {text.vipDesc1}<br/>{text.vipDesc2}
                    </div>
                  </div>
                  <div style={{ fontSize: 'clamp(16px, 4vw, 20px)', background: '#000', color: '#FFD700', padding: '8px 15px', borderRadius: '10px', fontWeight: 'bold', fontFamily: "'VT323', monospace", border: '2px solid #FFD700', textAlign: 'center', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: text.vipBtnTest }}>
                  </div>
                </div>

                {/* THÊM NÚT KHÔI PHỤC VÀO ĐÂY */}
                <div style={{ textAlign: 'center' }}>
                  <button 
                    onClick={handleRestorePurchases} 
                    style={{ background: 'transparent', color: '#ccc', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontFamily: "'VT323', monospace", fontSize: 'clamp(14px, 4vw, 16px)' }}
                  >
                    {text.restorePurchases || 'Khôi phục mua hàng (Restore Purchases)'}
                  </button>
                </div>
              </div>
            ) : (
               <div style={{
                background: 'rgba(255, 215, 0, 0.1)', border: '2px dashed #FFD700', borderRadius: '15px',
                padding: '15px', textAlign: 'center', color: '#FFD700', fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 'bold',
                fontFamily: "'VT323', monospace", textShadow: '0 0 10px rgba(255, 215, 0, 0.5)', boxSizing: 'border-box'
              }}>
                {text.vipOwned}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
            
            {/* CỘT 1: SKIN */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px', boxSizing: 'border-box' }}>
              <div style={{ color: '#FFD700', fontSize: 'clamp(20px, 5vw, 26px)', marginBottom: '10px', textAlign: 'center' }}>{text.catSkin}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {SKINS.map(s => {
                  const isOwned = gsRef.current.inventory?.skins.includes(s.id);
                  const isEquipped = gsRef.current.userSettings.skin === s.id;
                  return (
                    <div key={s.id} className="shop-item" onClick={() => handlePurchase('skin', s)} 
                      style={{ border: isEquipped ? '3px solid #FFD700' : '2px solid #555', background: isEquipped ? 'rgba(255, 215, 0, 0.1)' : '#333', width: 'clamp(80px, 22vw, 100px)', minHeight: '110px', height: 'auto', padding: '10px 5px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', flexDirection: 'column', boxSizing: 'border-box' }}>
                      <div style={{ 
                        width: 'clamp(50px, 15vw, 65px)', // 👉 Tăng kích thước cơ bản lên một chút (từ 45px lên tối đa 65px)
                        height: 'clamp(50px, 15vw, 65px)', // 👉 Phải là hình vuông để không bị méo ảnh
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        overflow: 'hidden', 
                        flexShrink: 0, 
                        marginTop: '5px' 
                      }}>
                        <img 
                          src={s.imgAlive || s.imgSrc} 
                          alt={s.name} 
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'contain', // 👉 GIẢI PHÁP CHÍNH: Giúp chú mèo "ôm" sát khung hình mà không bị mất hình
                            flexShrink: 0 
                            // 'imageRendering: pixelated'
                          }} 
                        />
                      </div>
                      <div style={{ fontSize: 'clamp(12px, 3.5vw, 14px)', color: '#ccc', marginTop: '5px', textAlign: 'center', wordBreak: 'break-word' }}>
                        {typeof s.name === 'object' ? (s.name[lang] || s.name['vi']) : s.name}
                      </div>
                      <div style={{ fontSize: 'clamp(12px, 3.5vw, 14px)', color: isOwned ? '#2ed573' : '#FFD700', fontWeight: 'bold', marginTop: 'auto', textAlign: 'center' }}>{isOwned ? (isEquipped ? text.useBtn : text.selectBtn) : `🪙 ${s.price}`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CỘT 2: BẢN ĐỒ (MAPS) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px', boxSizing: 'border-box' }}>
              <div style={{ color: '#00FFFF', fontSize: 'clamp(20px, 5vw, 26px)', marginBottom: '10px', textAlign: 'center' }}>{text.backgrounds}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {BACKGROUNDS.map(b => {
                  const isOwned = gsRef.current.inventory?.bgs.includes(b.id);
                  const isEquipped = gsRef.current.userSettings.bg === b.id;
                  return (
                    <div key={b.id} className="shop-item" onClick={() => handlePurchase('bg', b)} 
                      style={{ border: isEquipped ? '3px solid #00FFFF' : '2px solid #555', background: isEquipped ? 'rgba(0, 255, 255, 0.1)' : '#333', width: 'clamp(80px, 22vw, 100px)', minHeight: '110px', height: 'auto', padding: '10px 5px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', flexDirection: 'column', boxSizing: 'border-box' }}>
                      <div style={{ background: `linear-gradient(to bottom, ${b.top}, ${b.bottom})`, width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #fff', flexShrink: 0 }}></div>
                      <div style={{ fontSize: 'clamp(12px, 3.5vw, 14px)', color: '#ccc', marginTop: '5px', textAlign: 'center', wordBreak: 'break-word' }}>
                        {typeof b.name === 'object' ? (b.name[lang] || b.name['vi']) : b.name}
                      </div>
                      <div style={{ fontSize: 'clamp(12px, 3.5vw, 14px)', color: isOwned ? '#2ed573' : '#FFD700', fontWeight: 'bold', marginTop: 'auto', textAlign: 'center' }}>{isOwned ? (isEquipped ? text.useBtn : text.selectBtn) : `🪙 ${b.price}`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CỘT 3: TIỆN ÍCH */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px', width: '100%', maxWidth: 'clamp(240px, 80vw, 300px)', boxSizing: 'border-box' }}>
              <div style={{ color: '#ff4757', fontSize: 'clamp(20px, 5vw, 26px)', marginBottom: '5px', textAlign: 'center' }}>{text.utilities}</div>
              
              {!uiUpdates.isVIP && (
                <div className="shop-item" onClick={async () => {
                    if (isProcessing) return; // 1. Chặn nếu đang xử lý
                    if (gsRef.current.lives >= 10) return toast.error(text.errLifeFull);
                    if (Number(gsRef.current.coins) < 50) return toast.error(text.errNotEnoughCoins);
                    
                    setIsProcessing(true); // 2. Khoá nút
                    
                    gsRef.current.coins -= 50;
                    gsRef.current.lives += 1;
                    setUIUpdates(prev => ({...prev, coins: gsRef.current.coins, lives: gsRef.current.lives})); 
                    await saveUserProfile(); 
                    toast.success(text.successLife);
                    
                    setIsProcessing(false); // 3. Xong việc thì mở khoá
                  }}
                  style={{ border: '2px solid #ff4757', background: '#333', width: '100%', minHeight: '80px', height: 'auto', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', flexDirection: 'column', boxSizing: 'border-box', textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(14px, 4vw, 18px)', color: '#fff', wordBreak: 'break-word' }}><span className="pixel-icon icon-heart"></span> {text.buyLifeDesc}</div>
                  <div style={{ fontSize: 'clamp(14px, 4vw, 18px)', color: '#FFD700', fontWeight: 'bold', marginTop: '5px' }}>{text.priceText} 50</div>
                </div>
              )}

              <div style={{ width: '100%', height: '1px', background: '#555', margin: '5px 0' }}></div>
              
              <div className="shop-item" onClick={async () => {
                if (isProcessing) return; // 1. Chặn spam click

                if (uiUpdates.isVIP) {
                  if (gsRef.current.dailyCoinCount >= 5) {
                    toast.error(text.errVipDailyLimit);
                    return;
                  }
                  setIsProcessing(true); // 2. Khoá nút
                  gsRef.current.coins += 50;
                  gsRef.current.dailyCoinCount += 1; 
                  setUIUpdates(prev => ({...prev, coins: gsRef.current.coins}));
                  await saveUserProfile();
                  toast.success(`${text.vipGetCoinSuccess} (${gsRef.current.dailyCoinCount}/5)`);
                  
                  setIsProcessing(false); // 3. Xong việc thì mở khoá
                } else {
                  watchAd('coin');
                }
              }} style={{ pointerEvents: (!uiUpdates.isVIP && isWatchingAd) ? 'none' : 'auto', opacity: (!uiUpdates.isVIP && isWatchingAd) ? 0.5 : 1, border: '2px solid #2ed573', background: '#2ed573', width: '100%', minHeight: '50px', height: 'auto', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', gap: '10px', boxSizing: 'border-box', textAlign: 'center', flexWrap: 'wrap' }}>
                <div className="pixel-icon icon-tv" style={{ flexShrink: 0 }}></div>
                <div style={{ fontSize: 'clamp(14px, 4vw, 18px)', color: '#FFD700', fontWeight: 'bold', wordBreak: 'break-word' }}>{uiUpdates.isVIP ? text.getCoinsVip : text.getCoinsFree}</div>
              </div>

              {!uiUpdates.isVIP && (
                <div className="shop-item" onClick={() => watchAd('life')} style={{ pointerEvents: isWatchingAd ? 'none' : 'auto', opacity: isWatchingAd ? 0.5 : 1, border: '2px solid #ff4757', background: '#ff4757', width: '100%', minHeight: '50px', height: 'auto', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', gap: '10px', boxSizing: 'border-box', textAlign: 'center', flexWrap: 'wrap' }}>
                  <div className="pixel-icon icon-tv" style={{ flexShrink: 0 }}></div>
                  <div style={{ fontSize: 'clamp(14px, 4vw, 18px)', color: '#fff', fontWeight: 'bold', wordBreak: 'break-word' }}>{text.getLifeFree}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}