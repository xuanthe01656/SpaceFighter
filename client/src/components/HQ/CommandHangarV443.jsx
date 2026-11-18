/**
 * Space Fighter V4.4.3 Command Hangar.
 * Presentation-only. Existing HQ keeps inventory mutation, battle launch,
 * energy, ticket, persistence and server-authoritative callbacks.
 */
import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442,
  resolveCommandHangarShipPreviewV442,
  resolveCommandHangarWeaponPreviewV442,
} from '../../game/assets/CommandHangarAssetPolicyV442.js';
import {
  HQ_MODE_PREBATTLE_V443,
  PORTAL_HANGAR_VERSION_V443,
} from '../../game/navigation/HangarNavigationV443.js';
import styles from './CommandHangarV443.module.css';

const compact = value => {
  const number = Number(value) || 0;
  if (Math.abs(number) < 1000) return String(Math.round(number));
  const units = ['', 'K', 'M', 'B'];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(number)) / 3));
  const scaled = number / (1000 ** index);
  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 1 : 2).replace(/\.0+$/, '')}${units[index]}`;
};

const RARITY_COLORS = Object.freeze({
  1: '#93a4bd',
  2: '#4ade80',
  3: '#48d8ff',
  4: '#b779ff',
  5: '#ffb547',
  6: '#e9fbff',
});

const rarityColor = value => RARITY_COLORS[Math.max(1, Math.min(6, Number(value) || 1))];

function PreviewImage({ src, fallback, alt, className }) {
  const [failed, setFailed] = useState(false);
  const resolved = failed ? fallback : src;
  if (!resolved) return <span className={styles.previewFallback} aria-hidden="true">◇</span>;
  return (
    <img
      src={resolved}
      alt={alt || ''}
      className={className}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function CurrencyChip({ Icon, value, tone }) {
  return (
    <span className={`${styles.currencyChip} ${styles[`currency_${tone}`] || ''}`}>
      <span className={styles.currencyIcon}>{Icon ? <Icon /> : null}</span>
      <strong>{compact(value)}</strong>
    </span>
  );
}

function LoadoutSlot({
  slot,
  label,
  itemName,
  preview,
  fallback,
  glyph,
  rarity = 1,
  onClick,
}) {
  const occupied = Boolean(itemName || preview || fallback);
  const accessible = occupied ? `${label}: ${itemName || label}` : `${label}: chưa trang bị`;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.93 }}
      className={`${styles.loadoutSlot} ${styles[`slot_${slot}`] || ''}`}
      style={{ '--slot-tone': rarityColor(rarity) }}
      onClick={onClick}
      aria-label={accessible}
      title={accessible}
      data-equipped={occupied ? 'true' : 'false'}
    >
      <span className={styles.slotSurface} aria-hidden="true">
        {preview || fallback ? (
          <PreviewImage src={preview} fallback={fallback} alt="" className={styles.slotImage} />
        ) : (
          <span className={styles.slotGlyph}>{glyph || '+'}</span>
        )}
      </span>
      <span className={styles.slotStatus} aria-hidden="true" />
      <span className={styles.srOnly}>{accessible}</span>
    </motion.button>
  );
}

function StatCell({ label, value, icon }) {
  return (
    <div className={styles.statCell}>
      <span className={styles.statIcon} aria-hidden="true">{icon}</span>
      <span><small>{label}</small><strong>{value}</strong></span>
    </div>
  );
}

function SelectorModal({
  lang,
  slot,
  title,
  items,
  equippedId,
  onClose,
  onEquip,
  onUnequip,
}) {
  const vi = lang === 'vi';
  return (
    <motion.div
      className={styles.modalBackdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className={styles.selectorModal}
        initial={{ y: 34, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 260, damping: 25 }}
        onClick={event => event.stopPropagation()}
        aria-label={title}
      >
        <header className={styles.selectorHeader}>
          <div><small>{vi ? 'CHỌN CẤU HÌNH' : 'SELECT LOADOUT'}</small><h2>{title}</h2></div>
          <button type="button" onClick={onClose} aria-label={vi ? 'Đóng' : 'Close'}>×</button>
        </header>
        <div className={styles.selectorGrid}>
          {items.length ? items.map(item => {
            const id = item.uuid || item.id;
            const name = item.name?.[lang] || item.name?.vi || item.name?.en || id;
            const selected = id === equippedId;
            const preview = item.type === 'aircraft'
              ? resolveCommandHangarShipPreviewV442(item.id || item.uuid, item.imgSrc)
              : resolveCommandHangarWeaponPreviewV442(item.baseId, item.imgSrc);
            return (
              <button
                type="button"
                key={id}
                className={`${styles.selectorItem} ${selected ? styles.selectorItemSelected : ''}`}
                style={{ '--item-tone': rarityColor(item.rarity || item.tier || 1) }}
                onClick={() => onEquip(id)}
              >
                <span className={styles.selectorPreview}>
                  <PreviewImage src={preview} fallback={item.imgSrc} alt="" className={styles.selectorImage} />
                </span>
                <span className={styles.selectorCopy}>
                  <strong>{name}</strong>
                  <small>{vi ? 'Cấp' : 'Level'} {item.level || 1}</small>
                </span>
                {selected ? <em>{vi ? 'ĐANG DÙNG' : 'EQUIPPED'}</em> : null}
              </button>
            );
          }) : <p className={styles.selectorEmpty}>{vi ? 'Chưa có vật phẩm phù hợp.' : 'No compatible item available.'}</p>}
        </div>
        {slot !== 'aircraft' && equippedId ? (
          <button type="button" className={styles.unequipButton} onClick={onUnequip}>
            {vi ? 'THÁO TRANG BỊ' : 'UNEQUIP'}
          </button>
        ) : null}
      </motion.section>
    </motion.div>
  );
}

export default function CommandHangarV443({
  gsRef,
  setScreen,
  lang,
  hangarMode = 'manage',
  gameMode,
  targetStage,
  dungeonName,
  coins,
  diamonds,
  currentAircraft,
  aircraftInfo,
  shipVisualInfo,
  currentPilot,
  calculatedCP,
  currentMainGun,
  currentWingman,
  currentArmor,
  currentDrone,
  mainGunItem,
  wingmanItem,
  armorItem,
  droneItem,
  getDynamicStat,
  ownedAircrafts,
  aircraftCatalog,
  selectingSlot,
  setSelectingSlot,
  popupItemsList,
  currentlyEquippedId,
  slotTitles,
  onEquipItem,
  onUnequipItem,
  onSelectAircraft,
  isLaunching,
  onLaunch,
  onBack,
  Icons,
  showCloudQa,
  onCloudQa,
  dungeonQaLabel,
}) {
  const [activeTab, setActiveTab] = useState('equipment');
  const vi = lang === 'vi';
  const prebattle = hangarMode === HQ_MODE_PREBATTLE_V443 && typeof onLaunch === 'function';
  const shipId = currentAircraft?.id || 'ship_xwing';
  const shipName = currentAircraft?.name?.[lang] || currentAircraft?.name?.vi || currentAircraft?.name?.en || shipId;
  const shipRole = String(currentAircraft?.role || 'fighter').replace(/_/g, ' ').toUpperCase();
  const shipLevel = Math.max(1, Number(aircraftInfo?.level) || 1);
  const shipStars = Math.max(1, Math.min(5, Number(aircraftInfo?.stars) || 1));
  const shipPreview = resolveCommandHangarShipPreviewV442(shipId, shipVisualInfo?.previewHQSrc || currentAircraft?.imgHq);
  const ownedIds = useMemo(() => Object.keys(ownedAircrafts || {})
    .filter(id => aircraftCatalog.some(aircraft => aircraft.id === id)), [ownedAircrafts, aircraftCatalog]);
  const currentIndex = Math.max(0, ownedIds.indexOf(shipId));

  const cycleShip = direction => {
    if (!ownedIds.length || typeof onSelectAircraft !== 'function') {
      setSelectingSlot('aircraft');
      return;
    }
    const nextIndex = (currentIndex + direction + ownedIds.length) % ownedIds.length;
    onSelectAircraft(ownedIds[nextIndex]);
  };

  const itemName = item => item?.name?.[lang] || item?.name?.vi || item?.name?.en || '';
  const equipment = {
    mainGun: {
      label: vi ? 'Súng chính' : 'Primary weapon',
      itemName: itemName(currentMainGun),
      rarity: mainGunItem?.rarity || 1,
      preview: resolveCommandHangarWeaponPreviewV442(mainGunItem?.baseId || currentMainGun?.id, currentMainGun?.imgSrc),
      fallback: currentMainGun?.imgSrc,
      glyph: '✦',
    },
    wingman: {
      label: vi ? 'Súng phụ' : 'Wing weapon',
      itemName: itemName(currentWingman),
      rarity: wingmanItem?.rarity || 1,
      preview: resolveCommandHangarWeaponPreviewV442(wingmanItem?.baseId || currentWingman?.id, currentWingman?.imgSrc),
      fallback: currentWingman?.imgSrc,
      glyph: '⌁',
    },
    armor: {
      label: vi ? 'Giáp' : 'Armor',
      itemName: itemName(currentArmor),
      rarity: armorItem?.rarity || 1,
      preview: currentArmor?.imgSrc,
      fallback: currentArmor?.imgSrc,
      glyph: '⬡',
    },
    drone: {
      label: vi ? 'Vệ tinh' : 'Drone',
      itemName: itemName(currentDrone),
      rarity: droneItem?.rarity || 1,
      preview: currentDrone?.imgSrc,
      fallback: currentDrone?.imgSrc,
      glyph: '◉',
    },
  };

  const mainAtk = currentMainGun
    ? getDynamicStat(currentMainGun.baseAtk, mainGunItem?.level, mainGunItem?.rarity)
    : 0;
  const wingAtk = currentWingman
    ? getDynamicStat(currentWingman.baseAtk, wingmanItem?.level, wingmanItem?.rarity)
    : 0;
  const armorHp = currentArmor
    ? getDynamicStat(currentArmor.baseHp, armorItem?.level, armorItem?.rarity, true)
    : 0;
  const hp = Math.round((Number(currentAircraft?.baseHp) || 0) * (1 + (shipLevel - 1) * 0.05) + armorHp);
  const attack = Math.round((Number(currentAircraft?.baseAtk) || 0) * (1 + (shipLevel - 1) * 0.05) + mainAtk + wingAtk);
  const armor = Math.round(Number(currentAircraft?.baseArmor) || 0);
  const speed = Number(currentAircraft?.speed) || 0;
  const launchTarget = gameMode === 'dungeon' ? dungeonName : `${vi ? 'ẢI' : 'STAGE'} ${targetStage}`;

  return (
    <motion.main
      className={`${styles.screen} scrollable-layer`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      data-sf-command-hangar={PORTAL_HANGAR_VERSION_V443}
      data-sf-hangar-mode={hangarMode}
      data-sf-model-delivery={COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.mode}
    >
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.content}>
        <header className={styles.header}>
          <button type="button" className={styles.backButton} onClick={onBack} aria-label={vi ? 'Trở về' : 'Back'}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className={styles.titleLockup}>
            <small>{prebattle ? (vi ? 'CHUẨN BỊ NHIỆM VỤ' : 'MISSION PREP') : 'COMMAND HANGAR'}</small>
            <h1>{vi ? 'TỔNG HÀNH DINH' : 'HEADQUARTERS'}</h1>
          </div>
          <div className={styles.wallet}>
            <CurrencyChip Icon={Icons?.Coin} value={coins} tone="coin" />
            <CurrencyChip Icon={Icons?.Gem} value={diamonds} tone="gem" />
          </div>
        </header>

        <section className={styles.shipSelector} aria-label={vi ? 'Phi cơ hiện tại' : 'Current aircraft'}>
          <button type="button" onClick={() => cycleShip(-1)} aria-label={vi ? 'Phi cơ trước' : 'Previous aircraft'}>‹</button>
          <div className={styles.shipIdentity}>
            <strong>{shipName}</strong>
            <small>{shipRole}</small>
          </div>
          <span className={styles.starRow} aria-label={`${shipStars}/5 stars`}>
            {Array.from({ length: 5 }, (_, index) => <i key={index} data-active={index < shipStars}>★</i>)}
          </span>
          <span className={styles.levelBadge}>{vi ? 'CẤP' : 'LV'} {shipLevel}</span>
          <div className={styles.cpBadge}><small>{vi ? 'LỰC CHIẾN' : 'POWER'}</small><strong>{Number(calculatedCP || 0).toLocaleString()}</strong></div>
          <button type="button" onClick={() => cycleShip(1)} aria-label={vi ? 'Phi cơ sau' : 'Next aircraft'}>›</button>
        </section>

        <section className={styles.hangarStage} aria-label={vi ? 'Cấu hình phi cơ' : 'Aircraft loadout'}>
          <LoadoutSlot slot="mainGun" {...equipment.mainGun} onClick={() => setSelectingSlot('mainGun')} />
          <LoadoutSlot slot="wingman" {...equipment.wingman} onClick={() => setSelectingSlot('wingman')} />
          <LoadoutSlot slot="armor" {...equipment.armor} onClick={() => setSelectingSlot('armor')} />
          <LoadoutSlot slot="drone" {...equipment.drone} onClick={() => setSelectingSlot('drone')} />
          <LoadoutSlot
            slot="pilot"
            label={vi ? 'Phi công' : 'Pilot'}
            itemName={currentPilot?.name?.[lang] || currentPilot?.name?.vi || ''}
            preview={currentPilot?.imgSrc}
            fallback={currentPilot?.imgSrc}
            rarity={currentPilot?.rarity || 1}
            glyph="◎"
            onClick={() => setScreen('pilots')}
          />
          <LoadoutSlot
            slot="skill"
            label={vi ? 'Kỹ năng tàu' : 'Ship skill'}
            itemName={currentAircraft?.description?.[lang] || currentAircraft?.description?.vi || ''}
            rarity={currentAircraft?.tier || 1}
            glyph="✧"
            onClick={() => setActiveTab('skills')}
          />

          <button type="button" className={styles.shipHero} onClick={() => setSelectingSlot('aircraft')}>
            <span className={styles.heroGlow} aria-hidden="true" />
            <PreviewImage src={shipPreview} fallback={shipVisualInfo?.previewHQSrc || currentAircraft?.imgHq} alt={shipName} className={styles.shipImage} />
            <span className={styles.heroCaption}><strong>{shipName}</strong><small>{vi ? 'CHẠM ĐỂ ĐỔI PHI CƠ' : 'TAP TO CHANGE AIRCRAFT'}</small></span>
          </button>
        </section>

        <nav className={styles.tabs} aria-label={vi ? 'Khu vực Tổng hành dinh' : 'Headquarters sections'}>
          {[
            ['equipment', vi ? 'TRANG BỊ' : 'EQUIPMENT'],
            ['skills', vi ? 'KỸ NĂNG' : 'SKILLS'],
            ['appearance', vi ? 'DIỆN MẠO' : 'APPEARANCE'],
          ].map(([id, label]) => (
            <button type="button" key={id} className={activeTab === id ? styles.activeTab : ''} onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </nav>

        {activeTab === 'equipment' ? (
          <>
            <section className={styles.pilotPanel}>
              <span className={styles.pilotPortraitShell} style={{ '--pilot-tone': rarityColor(currentPilot?.rarity || 1) }}>
                <PreviewImage src={currentPilot?.imgSrc} fallback={currentPilot?.imgSrc} alt="" className={styles.pilotPortrait} />
              </span>
              <div className={styles.pilotCopy}>
                <small>{vi ? 'PHI CÔNG ĐANG TRỰC' : 'ACTIVE PILOT'}</small>
                <h2>{currentPilot?.name?.[lang] || currentPilot?.name?.vi || 'Pilot'}</h2>
                <p>{currentPilot?.skillDesc?.[lang] || currentPilot?.skillDesc?.vi || currentPilot?.description?.[lang] || ''}</p>
              </div>
              <button type="button" onClick={() => setScreen('pilots')}>{vi ? 'THAY ĐỔI' : 'CHANGE'}</button>
            </section>

            <section className={styles.fleetPanel}>
              <header><div><small>{vi ? 'BỘ SƯU TẬP' : 'COLLECTION'}</small><h2>{vi ? 'PHI CƠ SỞ HỮU' : 'OWNED AIRCRAFT'}</h2></div><strong>{ownedIds.length}/{aircraftCatalog.length}</strong></header>
              <div className={styles.fleetRail}>
                {ownedIds.map(id => {
                  const aircraft = aircraftCatalog.find(item => item.id === id);
                  const info = ownedAircrafts?.[id];
                  const selected = id === shipId;
                  return (
                    <button
                      type="button"
                      key={id}
                      onClick={() => onSelectAircraft(id)}
                      className={selected ? styles.fleetSelected : ''}
                      style={{ '--fleet-tone': rarityColor(aircraft?.tier || 1) }}
                    >
                      <span className={styles.fleetPreview}><PreviewImage src={resolveCommandHangarShipPreviewV442(id, aircraft?.imgHq)} fallback={aircraft?.imgHq} alt="" className={styles.fleetImage} /></span>
                      <strong>{aircraft?.name?.[lang] || aircraft?.name?.vi || id}</strong>
                      <small>{vi ? 'CẤP' : 'LV'} {typeof info === 'object' ? info.level || 1 : 1}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === 'skills' ? (
          <section className={styles.infoPanel}>
            <header><small>COMBAT V2</small><h2>{vi ? 'KỸ NĂNG & NỘI TẠI' : 'SKILLS & PASSIVES'}</h2></header>
            <div className={styles.infoGrid}>
              <article><span>✧</span><div><strong>{vi ? 'KỸ NĂNG TÀU' : 'SHIP ABILITY'}</strong><p>{currentAircraft?.description?.[lang] || currentAircraft?.description?.vi || ''}</p></div></article>
              <article><span>◈</span><div><strong>{vi ? 'NỘI TẠI PHI CÔNG' : 'PILOT PASSIVE'}</strong><p>{currentPilot?.skillDesc?.[lang] || currentPilot?.skillDesc?.vi || ''}</p></div></article>
              <article><span>⬡</span><div><strong>{vi ? 'GIÁP TỰ ĐỘNG' : 'PASSIVE ARMOR'}</strong><p>{currentArmor ? itemName(currentArmor) : (vi ? 'Chưa trang bị.' : 'Not equipped.')}</p></div></article>
            </div>
            <p className={styles.contractNote}>{vi
              ? 'Chỉ có một kỹ năng tàu chủ động. Giáp, né tránh và nội tại phi công vẫn tự động.'
              : 'Exactly one manual ship skill. Armor, dodge and pilot traits remain passive.'}</p>
          </section>
        ) : null}

        {activeTab === 'appearance' ? (
          <section className={styles.infoPanel}>
            <header><small>{vi ? 'HÌNH ẢNH PHI CƠ' : 'AIRCRAFT VISUALS'}</small><h2>{vi ? 'DIỆN MẠO' : 'APPEARANCE'}</h2></header>
            <div className={styles.appearanceLayout}>
              <span className={styles.appearancePreview}><PreviewImage src={shipPreview} fallback={currentAircraft?.imgHq} alt="" className={styles.appearanceImage} /></span>
              <div><strong>{vi ? 'ẢNH PHI CƠ ĐÃ SẴN SÀNG' : 'AIRCRAFT PREVIEW READY'}</strong><p>{vi ? 'Mô hình 3D sẽ được tải riêng khi tính năng này được phát hành.' : 'The 3D model will be delivered separately when the feature is released.'}</p></div>
            </div>
          </section>
        ) : null}

        <section className={styles.statsBar} aria-label={vi ? 'Chỉ số chiến đấu' : 'Combat statistics'}>
          <StatCell icon="✦" label={vi ? 'TẤN CÔNG' : 'ATTACK'} value={attack.toLocaleString()} />
          <StatCell icon="♥" label={vi ? 'SINH LỰC' : 'HULL'} value={hp.toLocaleString()} />
          <StatCell icon="⬡" label={vi ? 'GIÁP' : 'ARMOR'} value={armor.toLocaleString()} />
          <StatCell icon="»" label={vi ? 'CƠ ĐỘNG' : 'MOBILITY'} value={speed.toFixed(1)} />
        </section>

        {dungeonQaLabel ? <div className={styles.qaBanner}>{dungeonQaLabel}</div> : null}
        {showCloudQa ? <button type="button" className={styles.qaButton} onClick={onCloudQa}>CLOUD QA · NON-ECONOMIC</button> : null}

        <footer className={styles.actionBar}>
          <button type="button" className={styles.secondaryAction} onClick={() => { gsRef.current.cameFromHQ = true; setScreen('inventory'); }}>
            <span aria-hidden="true">☷</span><strong>{vi ? 'KHO TRANG BỊ' : 'INVENTORY'}</strong>
          </button>
          {prebattle ? (
            <button type="button" className={styles.primaryAction} disabled={isLaunching} onClick={onLaunch}>
              <span aria-hidden="true">⇈</span><span><strong>{isLaunching ? (vi ? 'ĐANG CHUẨN BỊ...' : 'PREPARING...') : (vi ? 'XUẤT KÍCH' : 'LAUNCH')}</strong><small>{launchTarget}</small></span>
            </button>
          ) : (
            <button type="button" className={styles.primaryAction} onClick={() => setSelectingSlot('aircraft')}>
              <span aria-hidden="true">◇</span><span><strong>{vi ? 'ĐỔI PHI CƠ' : 'SELECT AIRCRAFT'}</strong><small>{vi ? 'QUẢN LÝ HẠM ĐỘI' : 'MANAGE FLEET'}</small></span>
            </button>
          )}
        </footer>
      </div>

      <AnimatePresence>
        {selectingSlot ? (
          <SelectorModal
            lang={lang}
            slot={selectingSlot}
            title={slotTitles?.[selectingSlot]?.[lang] || slotTitles?.[selectingSlot]?.vi || selectingSlot}
            items={popupItemsList || []}
            equippedId={currentlyEquippedId}
            onClose={() => setSelectingSlot(null)}
            onEquip={onEquipItem}
            onUnequip={onUnequipItem}
          />
        ) : null}
      </AnimatePresence>
    </motion.main>
  );
}
