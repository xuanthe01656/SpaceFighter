import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { choosePerformancePreset, attachAdaptiveRenderQuality } from '../../game/config/PerformanceProfiles';
import { createDungeonScene } from './DungeonScene';
import { DUNGEON_CONFIG, EVENT_CONFIG } from '../../constants';
import { activeCoinMultiplier } from '../../utils/guestProgress';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';
import { isDungeonQaRunV391 } from '../../game/dungeon/DungeonQaAccessV391.js';
import DungeonHudV396, { EMPTY_DUNGEON_HUD_STATE_V396 } from '../../ui-system/DungeonHudV396.jsx';
import DungeonQaEvidencePanelV400 from '../../ui-system/DungeonQaEvidencePanelV400.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse amountStr từ DUNGEON_CONFIG (vd: "10K - 50K" → [10000,50000], "1 - 5" → [1,5])
 * rồi random roll trong khoảng đó.
 */
const rollAmount = (amountStr = '0') => {
  const cleaned = amountStr.replace(/K/gi, '000').replace(/\s/g, '');
  const parts   = cleaned.split('-').map(s => parseInt(s)).filter(n => !isNaN(n));
  const min     = parts[0] || 0;
  const max     = parts[1] !== undefined ? parts[1] : min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Tính thưởng thực tế từ config dungeon + kết quả trận:
 *  - Mỗi reward type roll theo amountStr
 *  - Cộng thêm thưởng điểm: Math.floor(score * 0.5) xu (capped 50 000)
 *  - Cộng thêm thưởng kill: 10 xu mỗi kill (capped 5 000)
 */
const calcRewards = (dungeonConfig, { score, totalKills }) => {
  const earned = [];

  // Thưởng từ config dungeon
  (dungeonConfig.rewards || []).forEach(rw => {
    const amount = rollAmount(rw.amountStr);
    if (amount > 0) earned.push({ type: rw.type, amount });
  });

  // Thưởng xu từ điểm (luôn có, nhờ score tích lũy suốt trận)
  const bonusCoins = Math.min(50000, Math.floor(score * 0.5) + totalKills * 10);
  if (bonusCoins > 0) {
    const existing = earned.find(r => r.type === 'coins');
    if (existing) existing.amount += bonusCoins;
    else earned.push({ type: 'coins', amount: bonusCoins });
  }

  return earned;
};


const HUD_COMPARE_KEYS_V396 = Object.freeze([
  'dungeonId', 'score', 'kills', 'hp', 'maxHp', 'roomIndex', 'roomNumber', 'roomTotal',
  'roomId', 'roomTitle', 'roomKind', 'roomKindLabel', 'roomTone', 'objectiveTitle',
  'objectiveBody', 'objectiveMode', 'objectiveLabel', 'objectiveValue',
  'objectiveSecondary', 'objectiveRatio', 'bossName', 'bossHp', 'bossMaxHp',
  'roomComplete', 'qaLabel', 'qaLoadoutLabel', 'roomMarkerSignature',
]);
const sameDungeonHudStateV396 = (previous, next) => HUD_COMPARE_KEYS_V396
  .every(key => previous?.[key] === next?.[key]);

// ── Component ─────────────────────────────────────────────────────────────────

export default function DungeonEngine({ gsRef, setScreen, lang, saveUserProfile, gameAction, getRealTime }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);
  const retreatLockRef = useRef(false);
  const [retreating, setRetreating] = React.useState(false);
  const [dungeonHud, setDungeonHud] = React.useState(EMPTY_DUNGEON_HUD_STATE_V396);
  const [dungeonNotice, setDungeonNotice] = React.useState(null);
  const noticeSequenceRef = useRef(0);
  const [dungeonQaEvidence, setDungeonQaEvidence] = React.useState(null);
  const dungeonQaEvidenceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const qualityProfile = choosePerformancePreset({
      userAgent: navigator.userAgent,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;
    const performance = attachAdaptiveRenderQuality(engine, scene, qualityProfile, window.devicePixelRatio || 1);


    // Lấy config dungeon hiện tại để tính thưởng sau
    const dungeonId     = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === dungeonId) || DUNGEON_CONFIG[0];
    const dungeonQaRun = isDungeonQaRunV391(gsRef.current?.dungeonQa, dungeonConfig.id)
      ? gsRef.current.dungeonQa
      : null;

    const data = {
      gsRef,
      lang,
      getRealTime,
      // QA runs suppress guest progress mutation as well as Cloud settlement.
      isCloud: Boolean(auth.currentUser) || Boolean(dungeonQaRun),
      onAnnouncement: notice => setDungeonNotice({
        ...notice,
        id: notice?.id || `dungeon-notice-${++noticeSequenceRef.current}`,
      }),
      // Snapshot is volatile and shown only when the existing Dungeon QA gate is active.
      onQaUpdate: report => {
        if (!dungeonQaRun || !report) return;
        dungeonQaEvidenceRef.current = report;
        setDungeonQaEvidence(report);
      },
      onHudUpdate: next => setDungeonHud(previous => {
        const normalized = { ...EMPTY_DUNGEON_HUD_STATE_V396, ...next };
        return sameDungeonHudStateV396(previous, normalized) ? previous : normalized;
      }),

      // ── THUA: không có thưởng, vào màn hình kết quả để hiển thị thống kê
      onGameOver: (result) => {
        gsRef.current.dungeonResult = {
          isVictory    : false,
          dungeon      : dungeonConfig,
          score        : result.score        || 0,
          totalKills   : result.totalKills   || 0,
          wavesCleared : result.wavesCleared || 0,
          maxWaves     : result.maxWaves     || 5,
          earnedRewards: [],   // Thua → không nhận thưởng
          qa            : dungeonQaRun,
          qaReport      : dungeonQaRun ? (result.qaReport || dungeonQaEvidenceRef.current) : null,
        };
        setScreen('dungeon_result');
      },

      // ── THẮNG: tính thưởng, lưu vào gsRef.current.dungeonResult
      onVictory: (result) => {
        // Cloud accounts receive only server-rolled rewards at claim time.
        const earnedRewards = (auth.currentUser || dungeonQaRun) ? [] : calcRewards(dungeonConfig, result);
        if (!auth.currentUser && !dungeonQaRun) {
          // Former scene-side bonus is now held until the player taps Claim.
          const bonus = Math.floor(Math.max(0,Number(result.score)||0)*0.1*activeCoinMultiplier(EVENT_CONFIG));
          if (bonus>0) {
            const coinRow=earnedRewards.find(row=>row.type==='coins');
            if (coinRow) coinRow.amount+=bonus;
            else earnedRewards.push({type:'coins',amount:bonus});
          }
        }

        gsRef.current.dungeonResult = {
          isVictory    : true,
          dungeon      : dungeonConfig,
          score        : result.score        || 0,
          totalKills   : result.totalKills   || 0,
          wavesCleared : result.wavesCleared || 0,
          maxWaves     : result.maxWaves     || 5,
          earnedRewards,
          qa            : dungeonQaRun,
          qaReport      : dungeonQaRun ? (result.qaReport || dungeonQaEvidenceRef.current) : null,
        };
        setScreen('dungeon_result');
      },

      onBossDefeated: () => {
        // Scene publishes the final Boss HUD snapshot; no authority is owned here.
      },
    };

    createDungeonScene(scene, canvasRef.current, engine, {...data, qualityProfile});

    engine.runRenderLoop(() => {
      if (scene && scene.activeCamera) scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      performance.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, [gsRef, lang, setScreen, saveUserProfile, gameAction, getRealTime]);

  const retreat = async () => {
    if (retreatLockRef.current) return;
    retreatLockRef.current = true;
    setRetreating(true);
    try {
      const dungeonQaRun = isDungeonQaRunV391(
        gsRef.current?.dungeonQa,
        gsRef.current?.selectedDungeonId,
      );
      if (!dungeonQaRun && auth.currentUser && gsRef.current.activeBattleId) {
        await gameAction('battle.abandon', { ticketId: gsRef.current.activeBattleId });
      }
      setScreen('dungeon_select');
    } catch (error) {
      toast.error(error?.message || (lang === 'vi' ? 'Không thể rút lui, thử lại.' : 'Retreat failed; retry.'));
    } finally {
      retreatLockRef.current = false;
      setRetreating(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      backgroundColor: '#020c1b', zIndex: 50, overflow: 'hidden',
    }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' }}
      />


      {isDungeonQaRunV391(gsRef.current?.dungeonQa, gsRef.current?.selectedDungeonId) &&
        <DungeonQaEvidencePanelV400 report={dungeonQaEvidence} lang={lang} />}
      <DungeonHudV396
        lang={lang}
        state={dungeonHud}
        announcement={dungeonNotice}
        onRetreat={retreat}
        retreating={retreating}
      />

    </div>
  );
}
