import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { choosePerformancePreset, attachAdaptiveRenderQuality } from '../../game/config/PerformanceProfiles';
import { createCampaignScene } from './CampaignScene';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';
import C15LocalAlpha1 from '../C15LocalAlpha1/index.jsx';

export default function CampaignEngine(props) {
  const data=props.gsRef?.current?.campaignData;
  const progress=data?.progress||{};
  const c15Eligible=import.meta.env.VITE_C15_RC1B_ENABLED==='true'&&Boolean(auth.currentUser)
    &&Number(progress.currentPlanet||1)===1&&Number(progress.selectedStage||1)===1;
  // Pin the engine lane for this mounted battle screen. RC3 settlement refreshes
  // canonical campaign progress (and may unlock/select stage 2), but that state
  // update must never replace an active/terminal C15 screen with the legacy
  // Campaign engine before the player explicitly presses CONTINUE.
  const c15LaneRef=useRef(c15Eligible);
  const c15Enabled=c15LaneRef.current;
  return c15Enabled
    ? <C15LocalAlpha1 setScreen={props.setScreen} lang={props.lang} refreshCloudProfile={props.refreshCloudProfile}/>
    : <LegacyCampaignEngine {...props}/>;
}

function LegacyCampaignEngine({ gsRef, setScreen, lang, saveUserProfile, getRealTime, gameAction }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);
  const retreatLockRef = useRef(false);
  const [retreating, setRetreating] = React.useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const qualityProfile = choosePerformancePreset({
      userAgent: navigator.userAgent,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
    // ── Babylon engine ────────────────────────────────────────────────────
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;
    const performance = attachAdaptiveRenderQuality(engine, scene, qualityProfile, window.devicePixelRatio || 1);


    // ── Callbacks cho CampaignScene ───────────────────────────────────────
    const data = {
      gsRef,
      lang,
      saveUserProfile,
      getRealTime,
      gameAction,
      isCloud: Boolean(auth.currentUser),

      /** Chiến thắng → quay về màn chọn ải */
      onVictory: () => {
        setScreen('stage_select');
      },

      /** Tử trận → về HQ (đã lưu coins trong scene trước khi gọi) */
      onDefeat: () => {
        setScreen('hq');
      },
    };

    createCampaignScene(scene, canvasRef.current, engine, {...data, qualityProfile});

    // ── Render loop ───────────────────────────────────────────────────────
    engine.runRenderLoop(() => {
      if (scene && scene.activeCamera) scene.render();
    });

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', onResize);
      performance.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, [gsRef, lang, setScreen, saveUserProfile]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      backgroundColor: '#020c1b', zIndex: 50, overflow: 'hidden',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block', width: '100%', height: '100%',
          touchAction: 'none', outline: 'none',
        }}
      />

      {/* Nút Rút Lui */}
      <button
        disabled={retreating}
        onClick={async () => {
          if (retreatLockRef.current) return;
          retreatLockRef.current = true;
          setRetreating(true);
          try {
            if (auth.currentUser && gsRef.current.activeBattleId) {
              // Never leave gameplay while the authoritative ticket is still open.
              await gameAction('battle.abandon',{ticketId:gsRef.current.activeBattleId});
            }
            setScreen('stage_select');
          } catch (error) {
            toast.error(error?.message || (lang === 'vi' ? 'Không thể rút lui, thử lại.' : 'Retreat failed; retry.'));
          } finally {
            retreatLockRef.current = false;
            setRetreating(false);
          }
        }}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top) + 40px)',
          left: '20px',
          padding: '8px 15px',
          background: 'rgba(0,0,0,0.5)',
          color: '#64ffda',
          border: '1px solid #64ffda',
          borderRadius: '5px',
          zIndex: 100,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        ◀ {retreating ? (lang === 'vi' ? 'ĐANG ĐÓNG TRẬN…' : 'CLOSING…') : (lang === 'vi' ? 'RÚT LUI' : 'RETREAT')}
      </button>
    </div>
  );
}