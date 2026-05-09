import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { createDungeonScene } from './DungeonScene';

export default function DungeonEngine({ gsRef, setScreen, lang, saveUserProfile }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Khởi tạo Babylon Engine
    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    engineRef.current = engine;

    // 2. Tạo Scene 3D
    const scene = new Scene(engine);
    sceneRef.current = scene;

    // 3. Khởi tạo Game State callbacks (Xử lý khi kết thúc game)
    const data = {
      gsRef,
      lang,
      onGameOver: (score) => {
        setScreen('dungeon_select'); 
      },
      onVictory: (score) => {
        if (saveUserProfile) saveUserProfile({ lastScore: score });
        setScreen('dungeon_select'); 
      },
      onBossDefeated: () => {
        // Callback rỗng – DungeonScene gọi khi boss chết
        // (bossPanel đã ẩn trong Babylon, không cần xử lý React)
      }
    };

    // 4. Gọi logic Game (Điểm, Máu, Quái, Đạn, Giao diện HUD... đã được Babylon lo hết ở đây)
    createDungeonScene(scene, canvasRef.current, engine, data);

    // 5. Vòng lặp Render liên tục
    engine.runRenderLoop(() => {
      if (scene && scene.activeCamera) {
        scene.render();
      }
    });

    // 6. Xử lý tự động co giãn khi đổi kích thước cửa sổ
    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      scene.dispose();
      engine.dispose();
    };
  }, [gsRef, lang, setScreen, saveUserProfile]); 

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#020c1b', zIndex: 50, overflow: 'hidden' }}>
      
      {/* KHUNG HIỂN THỊ CHÍNH CỦA GAME (BABYLON.JS) */}
      <canvas 
        ref={canvasRef} 
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' }} 
      />

      {/* NÚT RÚT LUI: Giao diện React duy nhất, CSS y hệt bên CampaignEngine */}
      <button 
        onClick={() => setScreen('dungeon_select')}
        style={{ 
          position: 'absolute', top: 'calc(env(safe-area-inset-top) + 40px)', left: '20px', 
          padding: '8px 15px', background: 'rgba(0,0,0,0.5)', color: '#64ffda', 
          border: '1px solid #64ffda', borderRadius: '5px', zIndex: 100, 
          fontFamily: "inherit", cursor: 'pointer', textTransform: 'uppercase' 
        }}
      >
        ◀ {lang === 'vi' ? 'RÚT LUI' : 'RETREAT'}
      </button>
      
    </div>
  );
}