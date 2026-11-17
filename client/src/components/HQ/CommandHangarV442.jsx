/**
 * Space Fighter V4.4.2 Command Hangar.
 * Presentation-only migration for HQ. Existing HQ owns inventory mutation,
 * battle launch, energy, ticket and server-authoritative callbacks.
 */
import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442,
  COMMAND_HANGAR_VERSION_V442,
  resolveCommandHangarRankFrameV442,
  resolveCommandHangarShipPreviewV442,
  resolveCommandHangarWeaponPreviewV442,
} from '../../game/assets/CommandHangarAssetPolicyV442.js';
import styles from './CommandHangarV442.module.css';

const clampRarity = value => Math.max(1, Math.min(6, Math.trunc(Number(value) || 1)));
const compact = value => {
  const number = Number(value) || 0;
  if (Math.abs(number) < 1000) return String(Math.round(number));
  const units = ['', 'K', 'M', 'B'];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(number)) / 3));
  const scaled = number / (1000 ** index);
  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 1 : 2).replace(/\.0+$/, '')}${units[index]}`;
};

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

function RankFrame({ rarity = 1, state = 'normal', children, className = '' }) {
  return (
    <span
      className={`${styles.rankFrame} ${className}`}
      style={{ '--sf-hangar-rank-frame': `url("${resolveCommandHangarRankFrameV442(rarity, state)}")` }}
    >
      {children}
    </span>
  );
}

function EquipmentNode({
  slot,
  label,
  itemName,
  level,
  rarity,
  preview,
  fallback,
  icon,
  emptyLabel,
  onClick,
}) {
  const occupied = Boolean(itemName || preview || fallback);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      className={`${styles.equipmentNode} ${styles[`node_${slot}`] || ''}`}
      onClick={onClick}
      aria-label={`${label}: ${itemName || emptyLabel}`}
    >
      <RankFrame rarity={rarity} state={occupied ? 'normal' : 'locked'} className={styles.nodeFrame}>
        {preview || fallback ? (
          <PreviewImage src={preview} fallback={fallback} alt="" className={styles.nodeImage} />
        ) : (
          <span className={styles.nodeGlyph} aria-hidden="true">{icon || '+'}</span>
        )}
      </RankFrame>
      <span className={styles.nodeCopy}>
        <span className={styles.nodeLabel}>{label}</span>
        <strong>{itemName || emptyLabel}</strong>
        {occupied && level ? <small>{`CẤP ${level}`}</small> : null}
      </span>
    </motion.button>
  );
}

function StatCell({ label, value, icon }) {
  return (
    <div className={styles.statCell}>
      <span aria-hidden="true">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
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
        initial={{ y: 36, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 260, damping: 25 }}
        onClick={event => event.stopPropagation()}
        aria-label={title}
      >
        <header className={styles.selectorHeader}>
          <div>
            <small>{lang === 'vi' ? 'CẤU HÌNH HANGAR' : 'HANGAR CONFIGURATION'}</small>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={lang === 'vi' ? 'Đóng' : 'Close'}>×</button>
        </header>
        <div className={styles.selectorGrid}>
          {items.length ? items.map(item => {
            const name = item.name?.[lang] || item.name?.vi || item.name?.en || item.id || item.uuid;
            const selected = (item.uuid || item.id) === equippedId;
            const preview = item.type === 'aircraft'
              ? resolveCommandHangarShipPreviewV442(item.id || item.uuid, item.imgSrc)
              : resolveCommandHangarWeaponPreviewV442(item.baseId, item.imgSrc);
            return (
              <button
                type="button"
                key={item.uuid || item.id}
                className={`${styles.selectorItem} ${selected ? styles.selectorItemSelected : ''}`}
                onClick={() => onEquip(item.uuid || item.id)}
              >
                <RankFrame rarity={item.rarity || 1} state={selected ? 'selected' : 'normal'}>
                  <PreviewImage src={preview} fallback={item.imgSrc} alt="" className={styles.selectorImage} />
                </RankFrame>
                <strong>{name}</strong>
                <small>{item.stats || `${lang === 'vi' ? 'Cấp' : 'Level'} ${item.level || 1}`}</small>
                {selected ? <em>{lang === 'vi' ? 'ĐANG DÙNG' : 'EQUIPPED'}</em> : null}
              </button>
            );
          }) : (
            <p className={styles.selectorEmpty}>{lang === 'vi' ? 'Chưa có vật phẩm phù hợp.' : 'No compatible item available.'}</p>
          )}
        </div>
        {slot !== 'aircraft' && equippedId ? (
          <button type="button" className={styles.unequipButton} onClick={onUnequip}>
            {lang === 'vi' ? 'THÁO TRANG BỊ' : 'UNEQUIP'}
          </button>
        ) : null}
      </motion.section>
    </motion.div>
  );
}

export default function CommandHangarV442({
  gsRef,
  setScreen,
  lang,
  gameMode,
  targetStage,
  dungeonName,
  energy,
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
      label: vi ? 'SÚNG CHÍNH' : 'PRIMARY',
      itemName: itemName(currentMainGun),
      level: mainGunItem?.level || 1,
      rarity: mainGunItem?.rarity || 1,
      preview: resolveCommandHangarWeaponPreviewV442(mainGunItem?.baseId || currentMainGun?.id, currentMainGun?.imgSrc),
      fallback: currentMainGun?.imgSrc,
      icon: '✦',
    },
    wingman: {
      label: vi ? 'SÚNG PHỤ' : 'WINGMAN',
      itemName: itemName(currentWingman),
      level: wingmanItem?.level || 1,
      rarity: wingmanItem?.rarity || 1,
      preview: resolveCommandHangarWeaponPreviewV442(wingmanItem?.baseId || currentWingman?.id, currentWingman?.imgSrc),
      fallback: currentWingman?.imgSrc,
      icon: '⌁',
    },
    armor: {
      label: vi ? 'GIÁP' : 'ARMOR',
      itemName: itemName(currentArmor),
      level: armorItem?.level || 1,
      rarity: armorItem?.rarity || 1,
      preview: currentArmor?.imgSrc,
      fallback: currentArmor?.imgSrc,
      icon: '⬡',
    },
    drone: {
      label: vi ? 'VỆ TINH' : 'DRONE',
      itemName: itemName(currentDrone),
      level: droneItem?.level || 1,
      rarity: droneItem?.rarity || 1,
      preview: currentDrone?.imgSrc,
      fallback: currentDrone?.imgSrc,
      icon: '◉',
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
  const launchTarget = gameMode === 'dungeon'
    ? dungeonName
    : `${vi ? 'ẢI' : 'STAGE'} ${targetStage}`;

  return (
    <motion.main
      className={`${styles.screen} scrollable-layer`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      data-sf-command-hangar={COMMAND_HANGAR_VERSION_V442}
      data-sf-model-delivery={COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.mode}
    >
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.content}>
        <header className={styles.header}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <span aria-hidden="true">‹</span>
            <strong>{vi ? 'TRỞ VỀ' : 'BACK'}</strong>
          </button>
          <div className={styles.titleLockup}>
            <small>COMMAND HANGAR</small>
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
            <div>
              <strong>{shipName}</strong>
              <small>{shipRole}</small>
            </div>
            <span className={styles.starRow} aria-label={`${shipStars}/5 stars`}>
              {Array.from({ length: 5 }, (_, index) => <i key={index} data-active={index < shipStars}>★</i>)}
            </span>
          </div>
          <span className={styles.levelBadge}>{vi ? 'CẤP' : 'LV'} {shipLevel}</span>
          <div className={styles.cpBadge}>
            <small>{vi ? 'LỰC CHIẾN' : 'COMBAT POWER'}</small>
            <strong>{Number(calculatedCP || 0).toLocaleString()}</strong>
          </div>
          <button type="button" onClick={() => cycleShip(1)} aria-label={vi ? 'Phi cơ sau' : 'Next aircraft'}>›</button>
        </section>

        <section className={styles.hangarStage}>
          <EquipmentNode
            slot="mainGun" {...equipment.mainGun}
            emptyLabel={vi ? 'CHƯA TRANG BỊ' : 'EMPTY'}
            onClick={() => setSelectingSlot('mainGun')}
          />
          <EquipmentNode
            slot="wingman" {...equipment.wingman}
            emptyLabel={vi ? 'CHƯA TRANG BỊ' : 'EMPTY'}
            onClick={() => setSelectingSlot('wingman')}
          />
          <EquipmentNode
            slot="armor" {...equipment.armor}
            emptyLabel={vi ? 'CHƯA TRANG BỊ' : 'EMPTY'}
            onClick={() => setSelectingSlot('armor')}
          />
          <EquipmentNode
            slot="drone" {...equipment.drone}
            emptyLabel={vi ? 'CHƯA TRANG BỊ' : 'EMPTY'}
            onClick={() => setSelectingSlot('drone')}
          />
          <EquipmentNode
            slot="pilot"
            label={vi ? 'PHI CÔNG' : 'PILOT'}
            itemName={currentPilot?.name?.[lang] || currentPilot?.name?.vi || 'Pilot'}
            level={1}
            rarity={currentPilot?.rarity || 1}
            preview={currentPilot?.imgSrc}
            fallback={currentPilot?.imgSrc}
            emptyLabel={vi ? 'CHỌN PHI CÔNG' : 'SELECT PILOT'}
            onClick={() => setScreen('pilots')}
          />
          <EquipmentNode
            slot="skill"
            label={vi ? 'KỸ NĂNG TÀU' : 'SHIP SKILL'}
            itemName={vi ? 'KỸ NĂNG CHỦ ĐỘNG' : 'ACTIVE ABILITY'}
            rarity={currentAircraft?.tier || 1}
            icon="✧"
            emptyLabel={vi ? 'XEM KỸ NĂNG' : 'VIEW SKILL'}
            onClick={() => setActiveTab('skills')}
          />

          <button type="button" className={styles.shipHero} onClick={() => setSelectingSlot('aircraft')}>
            <span className={styles.heroGlow} aria-hidden="true" />
            <PreviewImage src={shipPreview} fallback={shipVisualInfo?.previewHQSrc || currentAircraft?.imgHq} alt={shipName} className={styles.shipImage} />
            <span className={styles.heroCaption}>
              <strong>{shipName}</strong>
              <small>{vi ? 'CHẠM ĐỂ ĐỔI PHI CƠ' : 'TAP TO CHANGE AIRCRAFT'}</small>
            </span>
            <span className={styles.previewMode}>2D LOCAL · 3D OPTIONAL</span>
          </button>
        </section>

        <nav className={styles.tabs} aria-label={vi ? 'Khu vực Tổng hành dinh' : 'Headquarters sections'}>
          {[
            ['equipment', vi ? 'TRANG BỊ' : 'EQUIPMENT'],
            ['skills', vi ? 'KỸ NĂNG' : 'SKILLS'],
            ['appearance', vi ? 'DIỆN MẠO' : 'APPEARANCE'],
          ].map(([id, label]) => (
            <button type="button" key={id} className={activeTab === id ? styles.activeTab : ''} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'equipment' ? (
          <>
            <section className={styles.pilotPanel}>
              <RankFrame rarity={currentPilot?.rarity || 1} state="selected" className={styles.pilotPortraitFrame}>
                <PreviewImage src={currentPilot?.imgSrc} fallback={currentPilot?.imgSrc} alt="" className={styles.pilotPortrait} />
              </RankFrame>
              <div className={styles.pilotCopy}>
                <small>{vi ? 'PHI CÔNG ĐANG TRỰC' : 'ACTIVE PILOT'}</small>
                <h2>{currentPilot?.name?.[lang] || currentPilot?.name?.vi || 'Pilot'}</h2>
                <p>{currentPilot?.skillDesc?.[lang] || currentPilot?.skillDesc?.vi || currentPilot?.description?.[lang] || ''}</p>
              </div>
              <button type="button" onClick={() => setScreen('pilots')}>{vi ? 'THAY ĐỔI' : 'CHANGE'}</button>
            </section>

            <section className={styles.fleetPanel}>
              <header>
                <div>
                  <small>{vi ? 'BỘ SƯU TẬP' : 'COLLECTION'}</small>
                  <h2>{vi ? 'PHI CƠ SỞ HỮU' : 'OWNED AIRCRAFT'}</h2>
                </div>
                <strong>{ownedIds.length}/{aircraftCatalog.length}</strong>
              </header>
              <div className={styles.fleetRail}>
                {ownedIds.map(id => {
                  const aircraft = aircraftCatalog.find(item => item.id === id);
                  const info = ownedAircrafts?.[id];
                  const selected = id === shipId;
                  return (
                    <button type="button" key={id} onClick={() => onSelectAircraft(id)} className={selected ? styles.fleetSelected : ''}>
                      <RankFrame rarity={aircraft?.tier || 1} state={selected ? 'selected' : 'normal'}>
                        <PreviewImage
                          src={resolveCommandHangarShipPreviewV442(id, aircraft?.imgHq)}
                          fallback={aircraft?.imgHq}
                          alt=""
                          className={styles.fleetImage}
                        />
                      </RankFrame>
                      <strong>{aircraft?.name?.[lang] || aircraft?.name?.vi || id}</strong>
                      <small>{vi ? 'CẤP' : 'LV'} {typeof info === 'object' ? info.level || 1 : 1}</small>
                    </button>
                  );
                })}
                {ownedIds.length < aircraftCatalog.length ? (
                  <button type="button" className={styles.lockedFleetCard} onClick={() => setSelectingSlot('aircraft')}>
                    <span aria-hidden="true">＋</span>
                    <strong>{vi ? 'XEM PHI CƠ' : 'VIEW AIRCRAFT'}</strong>
                    <small>{aircraftCatalog.length - ownedIds.length} {vi ? 'CHƯA MỞ' : 'LOCKED'}</small>
                  </button>
                ) : null}
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
            <header><small>VISUAL DELIVERY</small><h2>{vi ? 'DIỆN MẠO PHI CƠ' : 'AIRCRAFT APPEARANCE'}</h2></header>
            <div className={styles.appearanceLayout}>
              <RankFrame rarity={currentAircraft?.tier || 1} state="selected">
                <PreviewImage src={shipPreview} fallback={currentAircraft?.imgHq} alt="" className={styles.appearanceImage} />
              </RankFrame>
              <div>
                <strong>{vi ? 'BẢN XEM TRƯỚC NGOẠI TUYẾN' : 'OFFLINE PREVIEW'}</strong>
                <p>{vi
                  ? 'Ảnh WebP nhẹ được lưu trong ứng dụng. Mô hình 3D là gói tùy chọn, chỉ kích hoạt sau khi tải và xác minh SHA-256.'
                  : 'A lightweight WebP preview is bundled locally. The 3D model is optional and activates only after download and SHA-256 verification.'}</p>
                <span className={styles.modelStatus}>{vi ? '3D: CHƯA TẢI · KHÔNG CHẶN GAME' : '3D: NOT DOWNLOADED · NON-BLOCKING'}</span>
              </div>
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
            <span aria-hidden="true">☷</span>
            <strong>{vi ? 'KHO TRANG BỊ' : 'INVENTORY'}</strong>
          </button>
          <button type="button" className={styles.primaryAction} disabled={isLaunching} onClick={onLaunch}>
            <span aria-hidden="true">⇈</span>
            <span>
              <strong>{isLaunching ? (vi ? 'ĐANG CHUẨN BỊ...' : 'PREPARING...') : (vi ? 'XUẤT KÍCH' : 'LAUNCH')}</strong>
              <small>{launchTarget}</small>
            </span>
          </button>
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
