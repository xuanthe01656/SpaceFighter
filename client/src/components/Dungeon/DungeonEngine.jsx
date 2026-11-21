import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { choosePerformancePreset, attachAdaptiveRenderQuality } from '../../game/config/PerformanceProfiles';
import { createDungeonScene } from './DungeonScene';
import { DUNGEON_CONFIG, EVENT_CONFIG } from '../../constants';
import { activeCoinMultiplier } from '../../utils/guestProgress';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';
import { isDungeonQaRunV391 } from '../../game/dungeon/DungeonQaAccessV391.js';
import { createDungeonRuntimeMonitorV450, DUNGEON_RUNTIME_LIMITS_V450 } from '../../game/dungeon/DungeonRuntimeReliabilityV450.js';
import DungeonHudV396, { EMPTY_DUNGEON_HUD_STATE_V396 } from '../../ui-system/DungeonHudV396.jsx';
import DungeonQaEvidencePanelV400 from '../../ui-system/DungeonQaEvidencePanelV400.jsx';
import DungeonShipSkillButtonV410 from '../../ui-system/DungeonShipSkillButtonV410.jsx';
import {issueDungeonC2BTicket} from '../../services/gameApi.js';
import {isDungeonC2BOptIn,validateDungeonC2BTicket} from '../../game/dungeon/DungeonC2BStagingQaContract.js';
import {assertDungeonC2BDebugApkGate} from '../../game/dungeon/DungeonC2BDebugGate.js';

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
  const dungeonAbilityControllerRef = useRef(null);
  const [dungeonAbilityState, setDungeonAbilityState] = React.useState(null);
  const [dungeonAbilityFeedback, setDungeonAbilityFeedback] = React.useState(null);
  const [dungeonRuntimeAlert, setDungeonRuntimeAlert] = React.useState(null);
  // Explicit debug APK QA opt-in only. Normal Guest Dungeon starts unchanged.
  const c2bQaRun = isDungeonQaRunV391(gsRef.current?.dungeonQa,
    gsRef.current?.selectedDungeonId) ? gsRef.current.dungeonQa : null;
  const c2bOptIn = isDungeonC2BOptIn({
    env:import.meta.env,qaRun:c2bQaRun,search:globalThis.location?.search || '',requested:gsRef.current?.dungeonC2BRequested===true,
  });
  const [c2bBoot, setC2bBoot] = React.useState(() => ({
    status:c2bOptIn ? 'pending' : 'legacy',ticket:null,error:null,
  }));
  useEffect(() => {
    if (!c2bOptIn) return;
    let mounted = true;
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('C2B requires a signed-in, allowlisted Firebase account');
        // Native MainActivity only registers this plugin in Android DEBUG.
        await assertDungeonC2BDebugApkGate();
        const response = await issueDungeonC2BTicket(uid,{
          dungeonId:'dung_taurus',roomId:'taurus_entry',
        });
        if (response.sameSessionParity!=='NOT_VERIFIED'||
            response.rewardSettlementEnabled!==false)
          throw new Error('C2B server response asserted unsupported authority');
        const ticket = validateDungeonC2BTicket({
          ticket:response.ticket,qaRun:c2bQaRun,nowMs:Date.now(),
        });
        if (mounted) setC2bBoot({status:'ready',ticket,error:null});
      } catch (error) {
        // Fail closed. A requested C2B session may never fall back to local seed.
        if (mounted) setC2bBoot({status:'rejected',ticket:null,
          error:error?.code || error?.message || 'C2B_QA_BOOTSTRAP_REJECTED'});
      }
    })();
    return () => { mounted = false; };
  }, [c2bOptIn, gsRef]);

  useEffect(() => {
    if (!canvasRef.current || (c2bOptIn && c2bBoot.status !== 'ready')) return;
    if (c2bOptIn) {
      // Do not start an expired/changed QA ticket, even after a React delay.
      try {validateDungeonC2BTicket({ticket:c2bBoot.ticket,qaRun:c2bQaRun,nowMs:Date.now()});}
      catch (_error) {setC2bBoot({status:'rejected',ticket:null,error:'C2B_TICKET_EXPIRED_BEFORE_SCENE'});return;}
    }

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
    const runtimeNowV450 = () => globalThis.performance?.now?.() ?? Date.now();
    const runtimeV450 = createDungeonRuntimeMonitorV450({ nowMs: runtimeNowV450() });
    runtimeV450.setVisible(document.visibilityState !== 'hidden', runtimeNowV450());
    let runtimeDisposedV450 = false;
    let runtimeAlertKindV450 = null;
    let loggedRuntimeStatusV450 = null;
    const publishRuntimeAlertV450 = (snapshot) => {
      const kind = ['render_exception', 'render_stalled', 'simulation_stalled', 'webgl_context_lost'].includes(snapshot?.state)
        ? snapshot.state : null;
      if (runtimeDisposedV450 || kind === runtimeAlertKindV450) return;
      runtimeAlertKindV450 = kind;
      setDungeonRuntimeAlert(kind ? snapshot : null);
    };


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
      dungeonC2BQaTicket:c2bOptIn ? c2bBoot.ticket : null,
      // QA runs suppress guest progress mutation as well as Cloud settlement.
      isCloud: Boolean(auth.currentUser) || Boolean(dungeonQaRun),
      onAnnouncement: notice => setDungeonNotice({
        ...notice,
        id: notice?.id || `dungeon-notice-${++noticeSequenceRef.current}`,
      }),
      // Snapshot is volatile and shown only when the existing Dungeon QA gate is active.
      onQaUpdate: report => {
        if (!dungeonQaRun || !report) return;
        const enriched = { ...report, runtimeHealthV450: runtimeV450.snapshot(runtimeNowV450()) };
        dungeonQaEvidenceRef.current = enriched;
        setDungeonQaEvidence(enriched);
      },
      onAbilityController: controller => {
        dungeonAbilityControllerRef.current = typeof controller === 'function' ? controller : null;
      },
      onAbilityState: snapshot => setDungeonAbilityState(snapshot || null),
      onAbilityFeedback: feedback => setDungeonAbilityFeedback(feedback || null),
      onRuntimeHeartbeat: detail => runtimeV450.simulationStep(runtimeNowV450(), detail),
      onRuntimeFault: detail => runtimeV450.simulationFault(runtimeNowV450(), detail),
      onRuntimePhase: detail => {
        if (detail?.phase === 'terminal') runtimeV450.setTerminal();
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

    // An exception inside any Babylon before-render observer must not escape
    // into requestAnimationFrame and leave a frozen canvas with live React UI.
    const renderDungeonFrameV450 = () => {
      runtimeV450.frameAttempt(runtimeNowV450());
      if (!scene?.activeCamera || (typeof scene.isDisposed === 'function' && scene.isDisposed())) return;
      try {
        scene.render();
        runtimeV450.frameSuccess(runtimeNowV450());
      } catch (error) {
        const errors = runtimeV450.frameError(runtimeNowV450(), error);
        if (errors === 1 || errors === DUNGEON_RUNTIME_LIMITS_V450.maxConsecutiveRenderErrors) {
          console.error('[DUNGEON_RUNTIME_RENDER_ERROR_V450]', error, runtimeV450.snapshot(runtimeNowV450()));
        }
        if (errors >= DUNGEON_RUNTIME_LIMITS_V450.maxConsecutiveRenderErrors) {
          // Never spin forever on a broken scene or manufacture a victory.
          runtimeV450.setRenderStopped(true);
          engine.stopRenderLoop(renderDungeonFrameV450);
        }
      }
    };
    engine.runRenderLoop(renderDungeonFrameV450);

    const handleResize = () => engine.resize();
    const handleVisibilityV450 = () => {
      runtimeV450.setVisible(document.visibilityState !== 'hidden', runtimeNowV450());
      if (document.visibilityState !== 'hidden') engine.resize();
    };
    const runtimeCanvasV450 = canvasRef.current;
    const handleContextLostV450 = event => {
      event.preventDefault();
      runtimeV450.setContextLost(true, runtimeNowV450());
      publishRuntimeAlertV450(runtimeV450.inspect(runtimeNowV450()));
    };
    const handleContextRestoredV450 = () => {
      runtimeV450.setContextLost(false, runtimeNowV450());
      engine.resize();
    };
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityV450);
    runtimeCanvasV450?.addEventListener('webglcontextlost', handleContextLostV450, false);
    runtimeCanvasV450?.addEventListener('webglcontextrestored', handleContextRestoredV450, false);
    const runtimeWatchdogV450 = globalThis.setInterval(() => {
      if (runtimeDisposedV450) return;
      const now = runtimeNowV450();
      const status = runtimeV450.inspect(now, {
        isDisposed: typeof scene.isDisposed === 'function' ? scene.isDisposed() : Boolean(scene.isDisposed),
      });
      if (['render_stalled', 'render_exception'].includes(status.state) && runtimeV450.canRestart()) {
        // One bounded render-loop rearm, preserving the same scene and battle.
        // A persistent exception is surfaced, not silently reset or rewarded.
        runtimeV450.noteRestart(now);
        engine.stopRenderLoop(renderDungeonFrameV450);
        engine.runRenderLoop(renderDungeonFrameV450);
        console.warn('[DUNGEON_RUNTIME_REARM_V450]', runtimeV450.snapshot(now));
      } else {
        publishRuntimeAlertV450(status);
        if (['render_stalled', 'render_exception', 'simulation_stalled', 'webgl_context_lost'].includes(status.state)) {
          if (loggedRuntimeStatusV450 !== status.state) {
            loggedRuntimeStatusV450 = status.state;
            console.warn('[DUNGEON_RUNTIME_STALL_V450]', status);
          }
        } else loggedRuntimeStatusV450 = null;
      }
    }, DUNGEON_RUNTIME_LIMITS_V450.inspectIntervalMs);

    return () => {
      runtimeDisposedV450 = true;
      runtimeV450.close();
      globalThis.clearInterval(runtimeWatchdogV450);
      document.removeEventListener('visibilitychange', handleVisibilityV450);
      runtimeCanvasV450?.removeEventListener('webglcontextlost', handleContextLostV450, false);
      runtimeCanvasV450?.removeEventListener('webglcontextrestored', handleContextRestoredV450, false);
      window.removeEventListener('resize', handleResize);
      engine.stopRenderLoop(renderDungeonFrameV450);
      performance.dispose();
      dungeonAbilityControllerRef.current = null;
      scene.dispose();
      engine.dispose();
    };
  // App.jsx recreates getRealTime on parent renders. It reads gsRef.current,
  // so retaining the initial function is safe; including it here tears down
  // Babylon during unrelated account/UI refreshes and can interrupt a run.
  // gameAction belongs to the retreat handler, not this scene-owning effect.
  }, [gsRef, lang, setScreen, c2bOptIn, c2bBoot.status]);

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
      {c2bOptIn && c2bBoot.status !== 'ready' && <div role="alert"
        data-dungeon-c2b-gate="true" style={{position:'absolute',zIndex:90,
          inset:0,display:'flex',flexDirection:'column',alignItems:'center',
          justifyContent:'center',gap:14,padding:24,color:'#e3f5ff',
          background:'rgba(2,10,24,0.97)',textAlign:'center'}}>
        <strong>{c2bBoot.status==='pending' ? 'C2B - Dang xac minh ticket QA staging'
          : 'C2B - Khong the mo Dungeon QA staging'}</strong>
        <div style={{fontSize:12,opacity:.8}}>{c2bBoot.status==='rejected'
          ? c2bBoot.error : 'Firebase Auth + Android DEBUG + server QA allowlist'}</div>
        <button type="button" onClick={()=>setScreen('dungeon_select')}
          style={{padding:'10px 18px',borderRadius:8}}>Quay lai phan chon phien ban</button>
      </div>}


      {dungeonRuntimeAlert && <div role="alert" data-dungeon-runtime-v450="true" style={{
        position: 'absolute', top: '18%', left: '10%', right: '10%', zIndex: 60,
        padding: '10px 12px', border: '1px solid #ffbb66', borderRadius: 10,
        color: '#ffe5bd', background: 'rgba(20, 13, 14, 0.9)',
        fontSize: 12, textAlign: 'center', pointerEvents: 'none',
      }}>
        {lang === 'vi' ? 'Dungeon dang gap loi cap nhat. Co the Rut lui an toan.'
          : 'Dungeon update stalled. You can safely retreat.'}
        <div style={{opacity: .8, marginTop: 4}}>
          {`QA ${dungeonRuntimeAlert.state} | frame ${dungeonRuntimeAlert.frameCount} | tick ${dungeonRuntimeAlert.simulationCount} | ${dungeonRuntimeAlert.lastFault?.message || 'no exception'}`}
        </div>
      </div>}

      {isDungeonQaRunV391(gsRef.current?.dungeonQa, gsRef.current?.selectedDungeonId) &&
        <DungeonQaEvidencePanelV400 report={dungeonQaEvidence} lang={lang} />}
      <DungeonShipSkillButtonV410
        lang={lang}
        state={dungeonAbilityState}
        feedback={dungeonAbilityFeedback}
        onActivate={slot => dungeonAbilityControllerRef.current?.(slot)}
      />
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
