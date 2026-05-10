import React, { useEffect, useRef } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { createDungeonScene } from './DungeonScene';
import { DUNGEON_CONFIG } from '../../constants';

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function DungeonEngine({ gsRef, setScreen, lang, saveUserProfile }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;

    // Lấy config dungeon hiện tại để tính thưởng sau
    const dungeonId     = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === dungeonId) || DUNGEON_CONFIG[0];

    const data = {
      gsRef,
      lang,

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
        };
        setScreen('dungeon_result');
      },

      // ── THẮNG: tính thưởng, lưu vào gsRef.current.dungeonResult
      onVictory: (result) => {
        const earnedRewards = calcRewards(dungeonConfig, result);

        gsRef.current.dungeonResult = {
          isVictory    : true,
          dungeon      : dungeonConfig,
          score        : result.score        || 0,
          totalKills   : result.totalKills   || 0,
          wavesCleared : result.wavesCleared || 0,
          maxWaves     : result.maxWaves     || 5,
          earnedRewards,
        };
        setScreen('dungeon_result');
      },

      onBossDefeated: () => {
        // Babylon HUD đã xử lý nội bộ — không cần React làm gì thêm
      },
    };

    createDungeonScene(scene, canvasRef.current, engine, data);

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
  }, [gsRef, lang, setScreen, saveUserProfile]);

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

      {/* Nút Rút Lui (chỉ UI React trong Dungeon) */}
      <button
        onClick={() => setScreen('dungeon_select')}
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