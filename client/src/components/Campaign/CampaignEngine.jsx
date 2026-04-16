import React, { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import CampaignScene from './CampaignScene';

export default function CampaignEngine({ gsRef, setScreen, lang }) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    // Đảm bảo thẻ div đã được render mới cho Phaser chạy
    if (!containerRef.current) return;

    const config = {
      type: Phaser.AUTO, 
      width: window.innerWidth,
      height: window.innerHeight,
      parent: containerRef.current, // 👇 ÉP PHASER VÀO REACT REF
      backgroundColor: '#020c1b',   // Trám nền đen xanh tối luôn cho Phaser
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
      },
      scene: [CampaignScene],
      scale: {
        mode: Phaser.Scale.RESIZE, 
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    };

    const game = new Phaser.Game(config);

    // Bơm dữ liệu
    game.registry.set('gsRef', gsRef);
    game.registry.set('setScreen', setScreen);
    game.registry.set('lang', lang);

    gameRef.current = game;

    // Dọn rác khi thoát màn hình
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []); 

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#020c1b', zIndex: 50, overflow: 'hidden' }}>
      
      {/* VÙNG ĐẤT CỦA PHASER */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* GIAO DIỆN REACT (UI) */}
      <button 
        onClick={() => setScreen('stage_select')}
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