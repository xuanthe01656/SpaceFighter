/**
 * Space Fighter V4.4.4 Portal Command Deck hero.
 *
 * Presentation-only. Existing CampaignPortal remains the owner of navigation,
 * modals, authentication, currencies and profile actions.
 */
import React from 'react';
import { AIRCRAFTS, PILOTS } from '../../constants.js';
import { resolveCommandHangarShipPreviewV442 } from '../../game/assets/CommandHangarAssetPolicyV442.js';
import {
  resolvePilotAccentV444,
  resolvePilotInitialsV444,
  resolvePilotPortraitCandidatesV444,
} from '../../game/assets/PilotVisualCatalogV444.js';
import ReliableAssetImageV444 from '../../ui-system/ReliableAssetImageV444.jsx';
import styles from './PortalCommandDeckV444.module.css';

export const PORTAL_COMMAND_DECK_VERSION_V444 = 'portal-command-deck-v4.4.4';

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export default function PortalCommandDeckV444({
  gsRef,
  lang = 'vi',
  playerName = '',
  currentUser = null,
  onOpenHq = null,
}) {
  const root = gsRef?.current || {};
  const campaignData = root.campaignData || {};
  const loadout = campaignData.loadout || {};
  const progress = campaignData.progress || {};
  const shipId = loadout.aircraft || 'ship_xwing';
  const pilotId = loadout.pilot || 'pilot_alpha';
  const ship = AIRCRAFTS.find(item => item.id === shipId) || AIRCRAFTS[0] || null;
  const pilot = PILOTS.find(item => item.id === pilotId) || PILOTS[0] || null;
  const shipInfo = campaignData.ownedAircrafts?.[shipId] || {};
  const level = Math.max(1, safeNumber(shipInfo.level, 1));
  const power = Math.max(0, Math.round(safeNumber(progress.combatPower, 0)));
  const shipName = ship?.name?.[lang] || ship?.name?.vi || ship?.name?.en || shipId;
  const pilotName = pilot?.name?.[lang] || pilot?.name?.vi || pilot?.name?.en || pilotId;
  const pilotCandidates = resolvePilotPortraitCandidatesV444(pilot);
  const pilotAccent = resolvePilotAccentV444(pilotId);
  const shipPreview = resolveCommandHangarShipPreviewV442(shipId, ship?.imgHq || ship?.imgSrc || '');
  const connectionLabel = currentUser
    ? (lang === 'vi' ? 'ĐÃ ĐỒNG BỘ' : 'SYNCED')
    : (lang === 'vi' ? 'HỒ SƠ CỤC BỘ' : 'LOCAL PROFILE');

  const content = (
    <>
      <div className={styles.windowGlow} aria-hidden="true" />
      <div className={styles.eyebrow}>
        <span>{lang === 'vi' ? 'CẦU CHỈ HUY' : 'COMMAND DECK'}</span>
        <em>{connectionLabel}</em>
      </div>
      <div className={styles.shipStage}>
        <span className={styles.orbitRing} aria-hidden="true" />
        <ReliableAssetImageV444
          candidates={[shipPreview, ship?.imgHq, ship?.imgSrc]}
          fallbackSrc={shipPreview}
          alt={shipName}
          className={styles.shipImage}
          fallbackClassName={styles.shipFallback}
          placeholder="◇"
          kind="ship"
          assetId={shipId}
        />
      </div>
      <div className={styles.shipInfo}>
        <small>{lang === 'vi' ? 'PHI CƠ TRỰC CHIẾN' : 'ACTIVE AIRCRAFT'}</small>
        <strong>{shipName}</strong>
        <span>{lang === 'vi' ? 'CẤP' : 'LV'} {level} · {lang === 'vi' ? 'LỰC CHIẾN' : 'POWER'} {power.toLocaleString()}</span>
      </div>
      <div className={styles.pilotStrip} style={{ '--pilot-tone': pilotAccent }}>
        <span className={styles.pilotPortrait}>
          <ReliableAssetImageV444
            candidates={pilotCandidates}
            alt={pilotName}
            className={styles.pilotImage}
            fallbackClassName={styles.pilotFallback}
            placeholder={resolvePilotInitialsV444(pilot, lang)}
            kind="pilot"
            assetId={pilotId}
          />
        </span>
        <span className={styles.pilotCopy}>
          <small>{lang === 'vi' ? 'PHI CÔNG' : 'PILOT'}</small>
          <strong>{pilotName}</strong>
        </span>
        <span className={styles.commanderCopy}>
          <small>{lang === 'vi' ? 'CHỈ HUY' : 'COMMANDER'}</small>
          <strong>{playerName || (lang === 'vi' ? 'PHI CÔNG' : 'PILOT')}</strong>
        </span>
      </div>
    </>
  );

  if (typeof onOpenHq === 'function') {
    return (
      <button
        type="button"
        className={styles.root}
        data-sf-portal-command-deck={PORTAL_COMMAND_DECK_VERSION_V444}
        onClick={onOpenHq}
        aria-label={lang === 'vi' ? 'Mở Tổng hành dinh' : 'Open Headquarters'}
      >
        {content}
      </button>
    );
  }

  return (
    <section className={styles.root} data-sf-portal-command-deck={PORTAL_COMMAND_DECK_VERSION_V444}>
      {content}
    </section>
  );
}
