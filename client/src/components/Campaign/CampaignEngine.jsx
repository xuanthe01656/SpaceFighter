import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { createCampaignScene } from './CampaignScene';

export default function CampaignEngine({ gsRef, setScreen, lang, saveUserProfile, getRealTime }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // ── Babylon engine ────────────────────────────────────────────────────
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;

    // ── Callbacks cho CampaignScene ───────────────────────────────────────
    const data = {
      gsRef,
      lang,
      saveUserProfile,
      getRealTime,

      /** Chiến thắng → quay về màn chọn ải */
      onVictory: () => {
        setScreen('stage_select');
      },

      /** Tử trận → về HQ (đã lưu coins trong scene trước khi gọi) */
      onDefeat: () => {
        setScreen('hq');
      },
    };

    createCampaignScene(scene, canvasRef.current, engine, data);

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
        onClick={() => setScreen('stage_select')}
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
        ◀ {lang === 'vi' ? 'RÚT LUI' : 'RETREAT'}
      </button>
    </div>
  );
}