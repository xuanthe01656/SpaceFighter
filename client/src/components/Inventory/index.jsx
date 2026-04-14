import React, { useState } from 'react';
import { GEAR_CATALOG, AIRCRAFTS, PILOTS } from '../../constants';
import styles from './Inventory.module.css';
import toast from 'react-hot-toast';

export default function Inventory({ gsRef, setScreen, lang, saveUserProfile }) {
  const [selectedId, setSelectedId] = useState(null);
  const campaignData = gsRef.current.campaignData;
  const { items, loadout } = campaignData;

  // 1. Chuyển Object items thành mảng để hiển thị Grid
  const inventoryList = Object.keys(items).map(uuid => ({
    uuid,
    ...items[uuid]
  }));

  const selectedItem = selectedId ? { uuid: selectedId, ...items[selectedId] } : null;
  const itemBaseInfo = selectedItem ? GEAR_CATALOG[selectedItem.type].find(g => g.id === selectedItem.baseId) : null;

  // 2. Logic tính toán lại Lực Chiến (CP)
  const calculateNewCP = (newLoadout) => {
    const aircraft = AIRCRAFTS.find(a => a.id === newLoadout.aircraft);
    const pilot = PILOTS.find(p => p.id === newLoadout.pilot);
    
    let totalAtk = aircraft.baseAtk;
    let totalHp = aircraft.baseHp;

    // Cộng chỉ số từ trang bị
    ['mainGun', 'wingman', 'armor'].forEach(slot => {
      const itemUuid = newLoadout[slot];
      if (itemUuid && items[itemUuid]) {
        const item = items[itemUuid];
        const base = GEAR_CATALOG[slot].find(g => g.id === item.baseId);
        if (base.baseAtk) totalAtk += base.baseAtk + (item.level * 2);
        if (base.baseHp) totalHp += base.baseHp + (item.level * 10);
      }
    });

    return (totalAtk * 10) + totalHp;
  };

  // 3. Hàm Trang bị / Tháo đồ (Toggle)
  const toggleEquip = () => {
    if (!selectedItem) return;

    const isEquipped = loadout[selectedItem.type] === selectedItem.uuid;
    // Nếu đang mặc thì tháo ra (gán chuỗi rỗng), ngược lại thì mặc vào
    const newLoadout = { 
      ...loadout, 
      [selectedItem.type]: isEquipped ? "" : selectedItem.uuid 
    };
    const newCP = calculateNewCP(newLoadout);
    // Cập nhật Local State
    gsRef.current.campaignData.loadout = newLoadout;
    gsRef.current.campaignData.progress.combatPower = newCP;
    // Đồng bộ Firebase
    saveUserProfile();
    toast.success(lang === 'vi' 
      ? (isEquipped ? 'Đã tháo trang bị!' : 'Đã trang bị!') 
      : (isEquipped ? 'Unequipped!' : 'Equipped!')
    );
  };

  return (
    <div className={`${styles.container} scrollable-layer`}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => setScreen('hq')}>
          ◀ {lang === 'vi' ? 'TRỞ VỀ HQ' : 'BACK TO HQ'}
        </button>
        <h2 style={{ margin: 0, color: '#FFD700' }}>{lang === 'vi' ? 'KHO TRANG BỊ' : 'GEAR INVENTORY'}</h2>
      </div>

      {/* GRID VẬT PHẨM */}
      <div className={styles.grid}>
        {inventoryList.map((item) => (
          <div 
            key={item.uuid}
            className={`${styles.itemSlot} ${styles['rarity' + item.rarity]} ${selectedId === item.uuid ? styles.selected : ''}`}
            onClick={() => setSelectedId(item.uuid)}
          >
            {loadout[item.type] === item.uuid && <span className={styles.equippedBadge}>E</span>}
            <span style={{ fontSize: '30px' }}>{item.type === 'mainGun' ? '🔫' : item.type === 'armor' ? '🛡️' : '🛸'}</span>
            <span style={{ fontSize: '12px', color: '#ccc' }}>Lv.{item.level}</span>
          </div>
        ))}
      </div>

      {/* CHI TIẾT VẬT PHẨM */}
      <div className={styles.detailPanel}>
        {selectedItem ? (
          <>
            <h3 style={{ margin: '0 0 10px 0', color: '#66fcf1' }}>{itemBaseInfo.name[lang]}</h3>
            <p style={{ margin: '2px 0' }}>{lang === 'vi' ? 'Cấp độ:' : 'Level:'} {selectedItem.level}</p>
            {itemBaseInfo.baseAtk && <p style={{ margin: '2px 0', color: '#ff4757' }}>🗡️ {lang === 'vi' ? 'Tấn công:' : 'Attack:'} {itemBaseInfo.baseAtk + (selectedItem.level * 2)}</p>}
            {itemBaseInfo.baseHp && <p style={{ margin: '2px 0', color: '#2ed573' }}>❤️ {lang === 'vi' ? 'Máu:' : 'HP:'} {itemBaseInfo.baseHp + (selectedItem.level * 10)}</p>}
            
            {/* KIỂM TRA TRẠNG THÁI MẶC ĐỒ */}
            {(() => {
              const isEquipped = loadout[selectedItem.type] === selectedItem.uuid;
              return (
                <button 
                  className={`${styles.equipBtn} ${isEquipped ? styles.unequipBtn : ''}`} 
                  onClick={toggleEquip}
                >
                  {isEquipped 
                    ? (lang === 'vi' ? 'THÁO RA' : 'UNEQUIP') 
                    : (lang === 'vi' ? 'TRANG BỊ' : 'EQUIP')}
                </button>
              );
            })()}
          </>
        ) : (
          <p style={{ textAlign: 'center', color: '#555', marginTop: '40px' }}>
            {lang === 'vi' ? 'Chọn một vật phẩm để xem chi tiết' : 'Select an item to see details'}
          </p>
        )}
      </div>
    </div>
  );
}