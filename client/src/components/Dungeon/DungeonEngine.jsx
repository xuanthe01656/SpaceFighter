import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Engine, Scene, Color4 } from '@babylonjs/core';
import { createDungeonScene } from './DungeonScene';

const COLORS = {
  cyan:   '#64ffda',
  red:    '#ff4444',
  gold:   '#ffd700',
  orange: '#ff9900',
  dark:   'rgba(0,0,0,0.85)',
};

const overlayBtnStyle = (color) => ({
  padding: '12px 32px',
  background: 'rgba(0,0,0,0.7)',
  color,
  border: `2px solid ${color}`,
  borderRadius: '6px',
  cursor: 'pointer',
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: '1rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  boxShadow: `0 0 14px ${color}55`,
  transition: 'all 0.2s',
});

export default function DungeonEngine({ gsRef, setScreen, lang, saveUserProfile }) {
  const canvasRef  = useRef(null);
  const engineRef  = useRef(null);
  const sceneRef   = useRef(null);

  const [gameResult, setGameResult] = useState(null);   // null | 'victory' | 'defeat'
  const [finalScore, setFinalScore] = useState(0);

  // Callbacks passed into the Babylon scene
  const onGameOver = useCallback((score) => {
    setFinalScore(score);
    setGameResult('defeat');
  }, []);

  const onVictory = useCallback((score) => {
    setFinalScore(score);
    setGameResult('victory');
    if (saveUserProfile) saveUserProfile({ lastScore: score });
  }, [saveUserProfile]);

  useEffect(() => {
    if (!canvasRef.current) return;

    // ── Engine ──────────────────────────────────────────────
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    // ── Scene ───────────────────────────────────────────────
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.01, 0.04, 0.1, 1);
    sceneRef.current = scene;

    // ── Game logic ──────────────────────────────────────────
    createDungeonScene(scene, canvasRef.current, engine, {
      gsRef,
      setScreen,
      lang,
      saveUserProfile,
      onGameOver,
      onVictory,
    });

    // ── Render loop ─────────────────────────────────────────
    engine.runRenderLoop(() => {
      if (scene && scene.activeCamera) scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      scene.dispose();
      engine.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI ───────────────────────────────────────────────────
  const isVictory = gameResult === 'victory';

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      backgroundColor: '#000', zIndex: 50, overflow: 'hidden',
    }}>
      {/* Babylon canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', touchAction: 'none', outline: 'none', display: 'block' }}
      />

      {/* Retreat button */}
      <button
        onClick={() => setScreen('dungeon_select')}
        style={{
          position: 'absolute',
          top: 'max(20px, env(safe-area-inset-top))',
          left: '20px',
          padding: '8px 15px',
          background: 'rgba(0,0,0,0.55)',
          color: COLORS.cyan,
          border: `1px solid ${COLORS.cyan}`,
          borderRadius: '5px',
          zIndex: 100,
          fontFamily: "'Share Tech Mono', monospace",
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        ◀ {lang === 'vi' ? 'RÚT LUI' : 'RETREAT'}
      </button>

      {/* Game Result Overlay */}
      {gameResult && (
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          background: COLORS.dark,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 200,
          fontFamily: "'Share Tech Mono', monospace",
          animation: 'fadeIn 0.6s ease',
        }}>
          <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>

          {/* Result title */}
          <div style={{
            fontSize: 'clamp(2rem, 8vw, 3.5rem)',
            fontWeight: 'bold',
            letterSpacing: '0.2em',
            color: isVictory ? COLORS.cyan : COLORS.red,
            textShadow: `0 0 30px ${isVictory ? COLORS.cyan : COLORS.red}`,
            marginBottom: '0.5rem',
          }}>
            {isVictory
              ? (lang === 'vi' ? '✦ CHIẾN THẮNG ✦' : '✦ VICTORY ✦')
              : (lang === 'vi' ? '✦ THẤT BẠI ✦'   : '✦ DEFEATED ✦')}
          </div>

          {/* Subtitle */}
          <div style={{ color: '#666', fontSize: '0.85rem', letterSpacing: '0.2em', marginBottom: '2rem' }}>
            {isVictory
              ? (lang === 'vi' ? 'PHÓ BẢN HOÀN THÀNH' : 'DUNGEON CLEARED')
              : (lang === 'vi' ? 'PHI THUYỀN BỊ PHÁ HỦY' : 'SHIP DESTROYED')}
          </div>

          {/* Score */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '1.2rem 3rem',
            marginBottom: '2.5rem',
            textAlign: 'center',
          }}>
            <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.3em', marginBottom: '0.4rem' }}>
              {lang === 'vi' ? 'ĐIỂM SỐ CUỐI' : 'FINAL SCORE'}
            </div>
            <div style={{ color: COLORS.gold, fontSize: '2.4rem', letterSpacing: '0.05em' }}>
              {finalScore.toLocaleString()}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => { setGameResult(null); window.location.reload(); }}
              style={overlayBtnStyle(COLORS.cyan)}
            >
              ↺ {lang === 'vi' ? 'THỬ LẠI' : 'RETRY'}
            </button>
            <button
              onClick={() => setScreen('dungeon_select')}
              style={overlayBtnStyle(COLORS.orange)}
            >
              ⌂ {lang === 'vi' ? 'THOÁT' : 'EXIT'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}