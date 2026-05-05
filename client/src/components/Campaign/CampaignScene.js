import * as Phaser from 'phaser';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS, PLANET_CONFIG, STAGE_CONFIG, PLANET_ENEMIES, PLANET_BOSSES} from '../../constants';

const TEXTS = {
  score: { vi: 'ĐIỂM', en: 'SCORE' },
  armor: { vi: 'HỆ THỐNG GIÁP', en: 'ARMOR SYSTEM' },
  retreat: { vi: '◀ RÚT LUI', en: '◀ RETREAT' },
  bossWarn: { vi: 'CẢNH BÁO:\nTRÙM CUỐI XUẤT HIỆN!', en: 'WARNING:\nBOSS APPROACHING!' },
  waveStart: { vi: 'TIẾN VÀO ĐỢT', en: 'ENTERING WAVE' },
  clear: { vi: 'DỌN SẠCH!', en: 'SECTOR CLEARED!' },
  campaignClear: { vi: 'HOÀN THÀNH\nCHIẾN DỊCH!', en: 'CAMPAIGN\nCLEARED!' },
  lost: { vi: 'THẤT BẠI!', en: 'MISSION FAILED!' }
};

export default class CampaignScene extends Phaser.Scene {
  constructor() { super('CampaignScene'); }

  preload() {
    const gsRef = this.registry.get('gsRef');
    const { items, loadout, progress } = gsRef.current.campaignData; 
    const currentPlanetId = progress.currentPlanet || 1;
    const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
    this.load.image('player_ship_img', aircraftBase.imgTop || '/images/ship_xwing_top.jpg');
    
    const wingmanItem = items[loadout.wingman];
    const wingmanBase = wingmanItem ? GEAR_CATALOG.wingman.find(g => g.id === wingmanItem.baseId) : null;
    if (wingmanBase && wingmanBase.imgSrc) this.load.image(wingmanBase.id, wingmanBase.imgSrc);
    
    const droneItem = items[loadout.drone];
    const droneBase = droneItem && GEAR_CATALOG.drone ? GEAR_CATALOG.drone.find(g => g.id === droneItem.baseId) : null;
    if (droneBase && droneBase.imgSrc) this.load.image(droneBase.id, droneBase.imgSrc);
    // --- TẢI HÌNH ẢNH QUÁI & BOSS TỪ CONSTANTS (NẾU CÓ) ---
    const currentEnemies = PLANET_ENEMIES[currentPlanetId] || PLANET_ENEMIES[1];
    const currentBosses = PLANET_BOSSES[currentPlanetId] || PLANET_BOSSES[1];

    currentEnemies.forEach(e => { if (e.imgSrc) this.load.image(e.id, e.imgSrc); });
    Object.values(currentBosses).forEach(b => { if (b.imgSrc) this.load.image(b.id, b.imgSrc); });
    const eS = this.add.graphics(); eS.fillStyle(0x1a0510, 1); eS.lineStyle(2, 0x00e5ff, 1); eS.beginPath(); eS.moveTo(15, 30); eS.lineTo(30, 10); eS.lineTo(0, 10); eS.closePath(); eS.fillPath(); eS.strokePath(); eS.generateTexture('fallback_enemy_small', 30, 30); eS.destroy();
    const eG = this.add.graphics(); eG.fillStyle(0x1a0510, 1); eG.lineStyle(2, 0xff4757, 1); eG.beginPath(); eG.moveTo(25, 50); eG.lineTo(50, 20); eG.lineTo(40, 0); eG.lineTo(10, 0); eG.lineTo(0, 20); eG.closePath(); eG.fillPath(); eG.strokePath(); eG.fillStyle(0xff4757, 0.8); eG.fillCircle(25, 20, 6); eG.generateTexture('fallback_enemy_medium', 50, 50); eG.destroy();
    const eL = this.add.graphics(); eL.fillStyle(0x1a0510, 1); eL.lineStyle(3, 0xfacc15, 1); eL.beginPath(); eL.moveTo(35, 70); eL.lineTo(70, 35); eL.lineTo(35, 0); eL.lineTo(0, 35); eL.closePath(); eL.fillPath(); eL.strokePath(); eL.fillStyle(0xfacc15, 0.5); eL.fillCircle(35, 35, 10); eL.generateTexture('fallback_enemy_large', 70, 70); eL.destroy();
    const eK = this.add.graphics(); eK.fillStyle(0x1a0510, 1); eK.lineStyle(2, 0x9c27b0, 1); eK.beginPath(); eK.moveTo(20, 40); eK.lineTo(40, 0); eK.lineTo(0, 0); eK.closePath(); eK.fillPath(); eK.strokePath(); eK.fillStyle(0x9c27b0, 1); eK.fillCircle(20, 15, 5); eK.generateTexture('fallback_enemy_kamikaze', 40, 40); eK.destroy();
    
    const bG = this.add.graphics(); bG.fillStyle(0x300000, 1); bG.lineStyle(4, 0xff0000, 1); bG.beginPath(); bG.moveTo(50, 0); bG.lineTo(100, 30); bG.lineTo(100, 90); bG.lineTo(50, 120); bG.lineTo(0, 90); bG.lineTo(0, 30); bG.closePath(); bG.fillPath(); bG.strokePath(); bG.fillStyle(0xff0000, 1); bG.fillCircle(50, 60, 20); bG.generateTexture('fallback_boss_mech', 100, 120); bG.destroy();
    const bA = this.add.graphics(); bA.fillStyle(0x1a0510, 1); bA.lineStyle(4, 0x9c27b0, 1); bA.beginPath(); bA.arc(60, 60, 50, 0, Math.PI * 2); bA.closePath(); bA.fillPath(); bA.strokePath(); bA.fillStyle(0x00e5ff, 1); bA.fillCircle(40, 50, 10); bA.fillCircle(80, 50, 10); bA.generateTexture('fallback_boss_alien', 120, 120); bA.destroy();
   
    const lG = this.add.graphics(); lG.fillStyle(0xffffff, 1); lG.fillRoundedRect(0, 0, 6, 24, 3); lG.generateTexture('laser', 6, 24); lG.destroy();
    const pG = this.add.graphics(); pG.fillStyle(0xffffff, 1); pG.fillCircle(8, 8, 8); pG.generateTexture('plasma', 16, 16); pG.destroy();
    const fG = this.add.graphics(); fG.fillStyle(0xffffff, 1); fG.fillCircle(8, 8, 8); fG.generateTexture('flare', 16, 16); fG.destroy();
    
    const dG = this.add.graphics(); dG.fillStyle(0x0a192f, 1); dG.lineStyle(2, 0x2ecc71, 1); dG.beginPath(); dG.moveTo(10, 0); dG.lineTo(20, 10); dG.lineTo(10, 20); dG.lineTo(0, 10); dG.closePath(); dG.fillPath(); dG.strokePath(); dG.fillStyle(0x2ecc71, 0.8); dG.fillCircle(10, 10, 3); dG.generateTexture('drone_img', 20, 20); dG.destroy();
    const cG = this.add.graphics(); cG.fillStyle(0xf1c40f, 1); cG.lineStyle(2, 0xffffff, 1); cG.fillCircle(10, 10, 10); cG.strokeCircle(10, 10, 10); cG.generateTexture('drop_coin', 20, 20); cG.destroy();
    const hG = this.add.graphics(); hG.fillStyle(0x2ecc71, 1); hG.lineStyle(1, 0xffffff, 1); hG.fillRect(6, 0, 8, 20); hG.fillRect(0, 6, 20, 8); hG.generateTexture('drop_heal', 20, 20); hG.destroy();
    const pwG = this.add.graphics(); pwG.fillStyle(0x3498db, 1); pwG.moveTo(10,0); pwG.lineTo(20,20); pwG.lineTo(0,20); pwG.fillPath(); pwG.generateTexture('drop_power', 20, 20); pwG.destroy();
  }

  create() {
    const gsRef = this.registry.get('gsRef');
    const { items, loadout, progress } = gsRef.current.campaignData;
    this.lang = this.registry.get('lang') || 'vi';
    
    // --- GALAXY DATA BINDING ---
    this.currentPlanetId = progress.currentPlanet || 1;
    this.planetConfig = PLANET_CONFIG[this.currentPlanetId] || PLANET_CONFIG[1];
    
    const pProgress = progress.planets[this.currentPlanetId];
    this.currentStage = progress.selectedStage || pProgress.highestStage || 1;
    this.isReplay = this.currentStage < (pProgress.highestStage || 1);
    this.stageConfig = STAGE_CONFIG[this.currentStage];
    
    this.maxWaves = this.stageConfig.waves;
    this.currentWave = 1;
    this.gameState = 'TRANSITION';
    this.enemiesToSpawn = this.stageConfig.baseEnemies + (this.currentWave * 2);
    this.enemiesSpawned = 0;
    this.startTime = this.time.now; // Bắt đầu tính giờ cho mốc 3 sao

    const pilotBase = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
    const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
    const armorItem = items[loadout.armor];
    const armorBase = armorItem ? GEAR_CATALOG.armor.find(g => g.id === armorItem.baseId) : null;
    const mainGunItem = items[loadout.mainGun];
    const mainGunBase = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;
    const wingmanItem = items[loadout.wingman];
    const wingmanBase = wingmanItem ? GEAR_CATALOG.wingman.find(g => g.id === wingmanItem.baseId) : null;
    const droneItem = items[loadout.drone];
    const droneBase = droneItem && GEAR_CATALOG.drone ? GEAR_CATALOG.drone.find(g => g.id === droneItem.baseId) : null;

    // 1. LẤY LEVEL CỦA PHI CƠ
    const ownedAircrafts = gsRef.current.campaignData.ownedAircrafts || {};
    const acData = ownedAircrafts[loadout.aircraft];
    const acLevel = (typeof acData === 'object' ? acData.level : 1) || 1;

    // 2. TÁI TẠO HÀM TÍNH CHỈ SỐ ĐỘNG (CHUẨN KHỚP VỚI KHO ĐỒ)
    const getDynamicStat = (baseStat, level, rarity, isHp = false) => {
      if (!baseStat) return 0;
      const perLevel = Math.max(isHp ? 5 : 1, Math.round(baseStat * 0.1 + (rarity || 1) * (isHp ? 10 : 2)));
      return baseStat + (perLevel * ((level || 1) - 1));
    };

    // Tốc bắn cơ bản (Giảm 1.5% delay mỗi cấp -> Bắn nhanh hơn)
    const getFireRate = (baseRate, level) => baseRate ? (baseRate * Math.pow(0.985, (level || 1) - 1)) * 1000 : 400;

    // 3. TÍNH CHỈ SỐ GỐC TỪ PHI CƠ (+5% mỗi cấp)
    const baseAcHp = Math.floor((aircraftBase.baseHp || 1000) * (1 + (acLevel - 1) * 0.05));
    const baseAcAtk = Math.floor((aircraftBase.baseAtk || 10) * (1 + (acLevel - 1) * 0.05));
    const baseAcArmor = Math.floor((aircraftBase.baseArmor || 20) * (1 + (acLevel - 1) * 0.05));

    // Tính chỉ số Trang bị
    const gunAtk = mainGunBase ? getDynamicStat(mainGunBase.baseAtk, mainGunItem?.level, mainGunItem?.rarity) : 0;
    const wingAtk = wingmanBase ? getDynamicStat(wingmanBase.baseAtk, wingmanItem?.level, wingmanItem?.rarity) : 0;
    const droneAtk = droneBase ? getDynamicStat(droneBase.baseAtk, droneItem?.level, droneItem?.rarity) : 0;
    const extraHp = armorBase ? getDynamicStat(armorBase.baseHp, armorItem?.level, armorItem?.rarity, true) : 0;

    // 4. HIỆU ỨNG PHI CÔNG (XỬ LÝ ĐỘNG TỪ PASSIVE VÀ VALUE)
    let mainAtkMult = 1.0;
    let wingRateMult = 1.0; 
    let moveSpeedMult = 1.0;
    let damageReduc = 0;
    let hpRegenRate = 0; 
    let dodgeRate = 0;
    let critDamageBoost = 0;

    if (pilotBase.passive) {
      const val = pilotBase.value;
      switch (pilotBase.passive) {
        case 'main_damage_boost': mainAtkMult = 1 + val; break; // Ví dụ: 1 + 0.10 = 1.1
        case 'hp_regen': hpRegenRate = val; break;
        case 'wing_fire_rate': wingRateMult = 1 - val; break; // Giảm delay (tăng tốc bắn)
        case 'movement_speed': moveSpeedMult = 1 + val; break;
        case 'damage_reduction': damageReduc = val; break;
        case 'dodge_and_crit': 
          dodgeRate = val.dodge; 
          critDamageBoost = val.critDamage; 
          break;
        // Các passive đặc biệt như nova_shield hay bullet_duplicate sẽ được xử lý trong logic game tương ứng
      }
    }
    
    // 5. ĐÓNG GÓI CHỈ SỐ
    this.stats = {
      hp: Math.floor((baseAcHp + extraHp)), 
      maxHp: Math.floor((baseAcHp + extraHp)),
      baseArmor: baseAcArmor, 
      armor: baseAcArmor,
      mainAtk: Math.floor((baseAcAtk + gunAtk) * mainAtkMult),
      wingAtk: wingAtk,
      droneAtk: droneAtk,
      mainFireRate: getFireRate(mainGunBase?.fireRate, mainGunItem?.level),
      wingFireRate: 600 * wingRateMult,
      droneFireRate: droneBase?.fireRate ? (droneBase.fireRate * Math.pow(0.985, (droneItem?.level || 1) - 1)) : 800,
      
      mainGunId: mainGunBase?.id || 'gun_laser',
      wingmanId: wingmanBase?.id || null,
      droneId: droneBase?.id || null,

      // Lưu các chỉ số bổ sung từ 8 phi công
      hpRegenRate,
      dodgeRate,
      critDamageBoost,
      damageReduc,
      moveSpeedMult,
      
      pilotId: pilotBase.id,
      passiveType: pilotBase.passive,
      passiveValue: pilotBase.value
    };

    this.score = 0;
    this.collectedCoins = 0; 
    this.nextEnemySpawn = 0; this.nextMainFire = 0; this.nextWingFire = 0; this.nextDroneFire = 0; this.nextBossFire = 0;
    this.nextHealTime = 0;

    const width = this.scale.width;
    const height = this.scale.height;
    
    this.bgGrid = this.add.grid(width / 2, height / 2, width, height * 2, 50, 50, 0x020c1b, 1, Phaser.Display.Color.HexStringToColor(this.planetConfig.color).color, 0.1);
    
    this.bullets = this.physics.add.group({ defaultKey: 'laser', maxSize: 500 });
    this.enemies = this.physics.add.group({ maxSize: 100 });
    this.enemyBullets = this.physics.add.group({ defaultKey: 'plasma', maxSize: 500 });
    this.drops = this.physics.add.group(); 
    this.enemyHpGraphics = this.add.graphics().setDepth(40);

    this.player = this.physics.add.sprite(width / 2, height - 100, 'player_ship_img');
    const targetWidth = Math.min(width * 0.5, 100);
    this.playerScale = targetWidth / (this.player.width || 1);
    this.player.setScale(this.playerScale);

    const hitScale = aircraftBase.hitboxScale || 0.8;
    const hitBoxWidth = this.player.width * hitScale * 0.72;
    const hitBoxHeight = this.player.height * hitScale * 0.58;
    this.player.body.setSize(hitBoxWidth, hitBoxHeight);
    this.player.body.setOffset((this.player.width - hitBoxWidth) / 2, (this.player.height - hitBoxHeight) / 2 + 18);
    this.player.setCollideWorldBounds(true);

    const flameScale = aircraftBase.engineFlameScale || 1.0;
    const flareConf = { speed: 200, angle: 90, scale: { start: 0.6 * this.playerScale * flameScale, end: 0 }, alpha: { start: 0.85, end: 0 }, blendMode: 'ADD', tint: aircraftBase.engineFlameTint || 0x00e5ff, lifespan: 220 };
    this.engineFlareLeft = this.add.particles(0, 0, 'flare', flareConf).startFollow(this.player, -this.player.displayWidth * 0.22, this.player.displayHeight * 0.40);
    this.engineFlareRight = this.add.particles(0, 0, 'flare', flareConf).startFollow(this.player, this.player.displayWidth * 0.22, this.player.displayHeight * 0.40);

    this.drones = [];
    if (this.stats.droneId && droneBase) {
      const droneScale = 0.055;
      const formation = [{ offsetX: -58, offsetY: 25 }, { offsetX: 58, offsetY: 25 }];
      formation.forEach((pos) => {
        const textureKey = this.textures.exists(droneBase.id) ? droneBase.id : 'drone_img';
        const drone = this.add.sprite(this.player.x + pos.offsetX, this.player.y + pos.offsetY, textureKey);
        drone.setScale(droneScale); drone.offsetX = pos.offsetX; drone.offsetY = pos.offsetY;
        drone.behavior = droneBase.behavior; drone.color = droneBase.color || 0xffffff; drone.projectileType = droneBase.projectileType || 'laser';
        this.drones.push(drone);
      });
    }

    this.player.setInteractive();
    this.input.setDraggable(this.player);
    this.input.on('drag', (pointer, obj, dragX, dragY) => {
      if (this.gameState === 'GAMEOVER') return;
      
      // HIỆU ỨNG TỐC ĐỘ TINH CẦU (PLANET DEBUFF)
      const speedModifier = 1 - (this.planetConfig.speedDebuff || 0);
      let dx = dragX - obj.x;
      let dy = (dragY - 40) - obj.y;
      
      obj.x += dx * speedModifier;
      obj.y += dy * speedModifier;
    });

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, null, this);
    this.physics.add.overlap(this.player, this.enemyBullets, this.hitPlayer, null, this);
    this.physics.add.overlap(this.player, this.drops, this.collectDrop, null, this);

    this.hudGraphics = this.add.graphics().setDepth(99);
    this.hpBarBg = this.add.graphics().setDepth(100);
    this.hpBar = this.add.graphics().setDepth(100);
    this.scoreText = this.add.text(0, 0, `${TEXTS.score[this.lang]}: 0`, { fontFamily: '"VT323", monospace', color: '#00e5ff' }).setDepth(100);
    this.waveText = this.add.text(0, 0, '', { fontFamily: '"VT323", monospace', color: '#f1c40f' }).setOrigin(1, 0).setDepth(100);
    this.hpText = this.add.text(0, 0, TEXTS.armor[this.lang], { fontFamily: '"VT323", monospace', color: '#fff' }).setOrigin(0.5, 0.5).setDepth(101);
    this.announceBg = this.add.graphics().setDepth(199).setAlpha(0);
    this.announceText = this.add.text(width / 2, height / 3, '', { fontFamily: '"VT323", monospace', color: '#fff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setAlpha(0).setDepth(200);
    
    this.updateHUDLayout();
    this.time.delayedCall(1000, () => this.startWave());
    this.scale.on('resize', this.handleResize, this);
  }

  updateHUDLayout() {
    const w = this.scale.width;
    const isSmallScreen = w < 400;
    this.scoreText.setFontSize(isSmallScreen ? '18px' : '22px');
    this.waveText.setFontSize(isSmallScreen ? '18px' : '22px');
    this.hpText.setFontSize(isSmallScreen ? '12px' : '14px');
    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x050b14, 0.85);
    this.hudGraphics.lineStyle(2, 0x00e5ff, 0.6);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(0, 0); this.hudGraphics.lineTo(w, 0); this.hudGraphics.lineTo(w, 35);
    this.hudGraphics.lineTo(w / 2 + 90, 35); this.hudGraphics.lineTo(w / 2 + 70, 65);
    this.hudGraphics.lineTo(w / 2 - 70, 65); this.hudGraphics.lineTo(w / 2 - 90, 35);
    this.hudGraphics.lineTo(0, 35); this.hudGraphics.closePath();
    this.hudGraphics.fillPath(); this.hudGraphics.strokePath();
    this.scoreText.setPosition(15, 10);
    this.waveText.setPosition(w - 15, 10);
    this.hpText.setPosition(w / 2, 22);
    this.updateHpBar();
  }

  updateHpBar() {
    const w = this.scale.width;
    const ratio = Math.max(0, this.stats.hp / this.stats.maxHp);
    const barW = 120; const barH = 12;
    const x = w / 2 - barW / 2; const y = 40;
    this.hpBarBg.clear(); this.hpBarBg.fillStyle(0x000000, 0.8); this.hpBarBg.lineStyle(1, 0x00e5ff, 0.4);
    this.hpBarBg.fillRect(x, y, barW, barH); this.hpBarBg.strokeRect(x, y, barW, barH);
    this.hpBar.clear();
    const color = ratio > 0.5 ? 0x00e5ff : (ratio > 0.25 ? 0xf1c40f : 0xff4757);
    this.hpBar.fillStyle(color, 1);
    const segments = 10; const segWidth = barW / segments; const gap = 2;
    for (let i = 0; i < segments; i++) {
      if (i * segWidth >= barW * ratio) break;
      let drawW = Math.min(segWidth - gap, (barW * ratio) - (i * segWidth));
      if (drawW > 0) this.hpBar.fillRect(x + i * segWidth + gap / 2, y + 2, drawW, barH - 4);
    }
  }

  showAnnounce(text, color = '#66fcf1', duration = 2000) {
    const w = this.scale.width; const h = this.scale.height;
    const calcFontSize = Math.max(20, Math.min(35, w * 0.07));
    this.announceText.setFontSize(`${calcFontSize}px`);
    this.announceText.setWordWrapWidth(w * 0.85); 
    this.announceText.setText(text).setColor(color);
    this.announceText.updateText();
    const actualTextHeight = this.announceText.height;
    this.announceBg.clear();
    this.announceBg.fillStyle(0x050b14, 0.9);
    this.announceBg.lineStyle(2, Phaser.Display.Color.HexStringToColor(color).color, 0.8);
    const bgY = (h / 3) - (actualTextHeight / 2) - 20;
    const bgH = actualTextHeight + 40;
    this.announceBg.fillRect(0, bgY, w, bgH);
    this.announceBg.beginPath();
    this.announceBg.moveTo(0, bgY); this.announceBg.lineTo(w, bgY);
    this.announceBg.moveTo(0, bgY + bgH); this.announceBg.lineTo(w, bgY + bgH);
    this.announceBg.strokePath();
    this.tweens.add({ targets: [this.announceText, this.announceBg], alpha: 1, yoyo: true, hold: duration, duration: 400 });
  }

  showTextEffect(x, y, text, color = '#FFD700') {
    const txt = this.add.text(x, y, text, { fontFamily: '"VT323", monospace', fontSize: '24px', fontStyle: 'bold', color: color }).setOrigin(0.5);
    this.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
  }

  explode(x, y, color, scale = 1) {
    const emitter = this.add.particles(x, y, 'flare', { speed: { min: 100, max: 400 }, angle: { min: 0, max: 360 }, scale: { start: 0.5 * scale, end: 0 }, blendMode: 'ADD', tint: color, lifespan: 300, quantity: 15 });
    emitter.explode();
  }

  startWave() {
    const waveStr = this.lang === 'vi' ? `ẢI ${this.currentStage} | ĐỢT ${this.currentWave}/${this.maxWaves}` : `STAGE ${this.currentStage} | WAVE ${this.currentWave}/${this.maxWaves}`;
    this.waveText.setText(waveStr);
    
    if (this.currentWave === this.maxWaves && this.stageConfig.hasBoss) {
      this.showAnnounce(TEXTS.bossWarn[this.lang], '#ff4757', 3000);
      this.gameState = 'BOSS_FIGHT';
      this.time.delayedCall(3500, () => this.spawnBoss());
      return;
    }
    
    this.enemiesToSpawn = this.stageConfig.baseEnemies + (this.currentWave * 3);
    this.enemiesSpawned = 0;
    this.showAnnounce(`${TEXTS.waveStart[this.lang]} ${this.currentWave}`, '#66fcf1');
    this.gameState = 'PLAYING';
  }

  stageCleared() {
    this.gameState = 'CLEAR';
    this.physics.pause(); 
    this.showAnnounce(TEXTS.campaignClear[this.lang], '#2ecc71', 2000);
    this.time.delayedCall(2500, () => {
       this.showRewardSummary();
    });
  }

  showRewardSummary() {
    const width = this.scale.width; const height = this.scale.height;
    const cx = width / 2; const cy = height / 2;
    const isMobile = width < 400;

    // --- TÍNH SAO VÀ THỜI GIAN (STAR & TIME LOGIC) ---
    const timeTaken = (this.time.now - this.startTime) / 1000;
    
    // Format thời gian thành MM:SS
    const minutes = Math.floor(timeTaken / 60);
    const seconds = Math.floor(timeTaken % 60);
    const timeString = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    // Đánh giá điều kiện
    const c1Met = true; // Luôn đúng vì đã thắng ải mới hiện bảng này
    const c2Met = (this.stats.hp / this.stats.maxHp) >= 0.5; // Máu trên 50%
    const stageLimit = this.stageConfig.timeLimit || 150;
    const c3Met = timeTaken <= stageLimit;
    const limitMin = Math.floor(stageLimit / 60);
    const limitSec = Math.floor(stageLimit % 60);
    const limitStr = `${limitMin < 10 ? '0' : ''}${limitMin}:${limitSec < 10 ? '0' : ''}${limitSec}`;

    let earnedStars = 1;
    if (c2Met) earnedStars++; 
    if (c3Met) earnedStars++;

    const overlay = this.add.graphics().setDepth(300).setAlpha(0);
    overlay.fillStyle(0x000000, 0.85); overlay.fillRect(0, 0, width, height);

    // KÉO DÀI BẢNG LÊN 560 ĐỂ CÓ CHỖ CHỨA ĐIỀU KIỆN
    const pW = Math.min(width * 0.9, 420); const pH = 560; 
    const panel = this.add.graphics().setDepth(301).setAlpha(0);
    panel.lineStyle(3, Phaser.Display.Color.HexStringToColor(this.planetConfig.color).color, 1);
    panel.fillStyle(0x050b14, 0.95);
    panel.strokeRoundedRect(cx - pW/2, cy - pH/2, pW, pH, 16);
    panel.fillRoundedRect(cx - pW/2, cy - pH/2, pW, pH, 16);

    const emitter = this.add.particles(cx, cy, 'flare', { speed: 150, scale: { start: 0.4, end: 0 }, blendMode: 'ADD', tint: 0xfacc15, lifespan: 1500, quantity: 1, frequency: 100 }).setDepth(299);

    const stageBonus = this.isReplay ? 10 : (50 + (this.currentStage * 50));
    const baseExp = this.stageConfig.expReward || 100;
    const earnedExp = this.isReplay ? Math.floor(baseExp * 0) : baseExp; 
    
    const totalCoins = stageBonus + this.score + this.collectedCoins;

    const titleFontSize = isMobile ? '26px' : '32px';
    const labelFontSize = isMobile ? '18px' : '20px'; // Thu nhỏ font lable 1 chút cho đỡ chật
    const valFontSize = isMobile ? '22px' : '24px';

    const title = this.add.text(cx, cy - pH/2 + 35, this.lang === 'vi' ? 'BÁO CÁO CHIẾN DỊCH' : 'MISSION REPORT', { fontFamily: '"VT323", monospace', fontSize: titleFontSize, color: '#facc15', fontStyle: 'bold', textShadow: '0 0 10px #facc15' }).setOrigin(0.5).setDepth(302).setAlpha(0);
    
    // HIỂN THỊ SAO
    const starStr = (earnedStars >= 1 ? '★ ' : '☆ ') + (earnedStars >= 2 ? '★ ' : '☆ ') + (earnedStars >= 3 ? '★' : '☆');
    const starsTxt = this.add.text(cx, cy - pH/2 + 75, starStr, { fontFamily: '"VT323", monospace', fontSize: '36px', color: '#facc15', textShadow: '0 0 10px #facc15' }).setOrigin(0.5).setDepth(302).setAlpha(0);

    // HIỂN THỊ 3 ĐIỀU KIỆN (Tick xanh / X đỏ)
    const condStyle = { fontFamily: '"VT323", monospace', fontSize: isMobile ? '16px' : '18px' };
    
    const cond1Y = cy - pH/2 + 120;
    const cond1 = this.add.text(cx, cond1Y, (c1Met ? '✅ ' : '❌ ') + (this.lang === 'vi' ? 'Hoàn thành nhiệm vụ' : 'Mission Cleared'), { ...condStyle, color: c1Met ? '#2ecc71' : '#ff4757' }).setOrigin(0.5).setDepth(302).setAlpha(0).setY(cond1Y + 20);
    
    const cond2Y = cy - pH/2 + 145;
    const cond2 = this.add.text(cx, cond2Y, (c2Met ? '✅ ' : '❌ ') + (this.lang === 'vi' ? 'Giáp còn lại ≥ 50%' : 'Armor remaining ≥ 50%'), { ...condStyle, color: c2Met ? '#2ecc71' : '#ff4757' }).setOrigin(0.5).setDepth(302).setAlpha(0).setY(cond2Y + 20);
    
    const cond3Y = cy - pH/2 + 170;
    const cond3 = this.add.text(cx, cond3Y, (c3Met ? '✅ ' : '❌ ') + (this.lang === 'vi' ? `Thời gian ≤ ${limitStr}` : `Clear Time ≤ ${limitStr}`), { ...condStyle, color: c3Met ? '#2ecc71' : '#ff4757' }).setOrigin(0.5).setDepth(302).setAlpha(0).setY(cond3Y + 20);

    const styleLabel = { fontFamily: '"VT323", monospace', fontSize: labelFontSize, color: '#94a3b8' };
    const styleValue = { fontFamily: '"VT323", monospace', fontSize: valFontSize, color: '#00e5ff', fontStyle: 'bold' };

    const innerXLeft = cx - pW/2 + (isMobile ? 20 : 30);
    const innerXRight = cx + pW/2 - (isMobile ? 20 : 30);

    // CÁC THÔNG SỐ (Dịch Y xuống để chừa chỗ cho Điều kiện)
    const tY0 = cy - 20;
    const txtTime = this.add.text(innerXLeft, tY0, this.lang === 'vi' ? 'Thời gian:' : 'Clear Time:', styleLabel).setOrigin(0, 0.5).setDepth(302).setAlpha(0).setY(tY0 + 20);
    const valTime = this.add.text(innerXRight, tY0, timeString, { ...styleValue, color: '#fff' }).setOrigin(1, 0.5).setDepth(302).setAlpha(0).setY(tY0 + 20);

    const tY1 = cy + 20;
    const txtExp = this.add.text(innerXLeft, tY1, this.lang === 'vi' ? 'Kinh nghiệm (EXP):' : 'EXP Gained:', styleLabel).setOrigin(0, 0.5).setDepth(302).setAlpha(0).setY(tY1 + 20);
    const valExp = this.add.text(innerXRight, tY1, `+${earnedExp}`, { ...styleValue, color: '#00ffcc' }).setOrigin(1, 0.5).setDepth(302).setAlpha(0).setY(tY1 + 20);
    
    const tY2 = cy + 60;
    const txtScore = this.add.text(innerXLeft, tY2, this.lang === 'vi' ? 'Điểm tác chiến:' : 'Combat Score:', styleLabel).setOrigin(0, 0.5).setDepth(302).setAlpha(0).setY(tY2 + 20);
    const valScore = this.add.text(innerXRight, tY2, `+${this.score}`, styleValue).setOrigin(1, 0.5).setDepth(302).setAlpha(0).setY(tY2 + 20);

    const tY3 = cy + 100;
    const txtLoot = this.add.text(innerXLeft, tY3, this.lang === 'vi' ? 'Nhặt được:' : 'Loot Collected:', styleLabel).setOrigin(0, 0.5).setDepth(302).setAlpha(0).setY(tY3 + 20);
    const valLoot = this.add.text(innerXRight, tY3, `+${this.collectedCoins}`, styleValue).setOrigin(1, 0.5).setDepth(302).setAlpha(0).setY(tY3 + 20);

    const lineY = cy + 140;
    const line = this.add.graphics().setDepth(302).setAlpha(0); line.lineStyle(2, 0x00e5ff, 0.3); line.moveTo(innerXLeft, lineY); line.lineTo(innerXRight, lineY); line.strokePath();

    const tY4 = cy + 185;
    const txtTotal = this.add.text(innerXLeft, tY4, this.lang === 'vi' ? 'TỔNG NHẬN:' : 'TOTAL EARNED:', { ...styleLabel, color: '#facc15', fontSize: '26px' }).setOrigin(0, 0.5).setDepth(302).setAlpha(0).setY(tY4 + 20);
    const valTotal = this.add.text(innerXRight, tY4, `${totalCoins} ${this.lang === 'vi' ? 'XU' : 'COINS'}`, { ...styleValue, color: '#facc15', fontSize: '32px', textShadow: '0 0 10px #facc15' }).setOrigin(1, 0.5).setDepth(302).setAlpha(0).setY(tY4 + 20);
    
    const btnW = isMobile ? 160 : 200; const btnH = isMobile ? 45 : 50; 
    const btnY = cy + pH/2 - 35; // Neo nút XÁC NHẬN gần mép dưới
    
    const btnContainer = this.add.container(cx, btnY).setDepth(305).setAlpha(0);
    const btnBg = this.add.graphics(); btnBg.fillStyle(0x00e5ff, 1); btnBg.fillRoundedRect(-btnW/2, -btnH/2, btnW, btnH, 10);
    const btnTxt = this.add.text(0, 0, this.lang === 'vi' ? 'XÁC NHẬN' : 'ACCEPT', { fontFamily: '"VT323", monospace', fontSize: isMobile ? '22px' : '26px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    btnContainer.add([btnBg, btnTxt]);
    const btnZone = this.add.zone(cx, btnY, btnW, btnH).setOrigin(0.5).setDepth(306).setInteractive({ useHandCursor: true });

    // CẬP NHẬT LẠI MẢNG ANIMATION (THÊM COND VÀ TIME VÀO)
    const uiElements = [overlay, panel, title, starsTxt, cond1, cond2, cond3, txtTime, valTime, txtExp, valExp, txtScore, valScore, txtLoot, valLoot, line, txtTotal, valTotal, btnContainer];
    this.tweens.add({ targets: uiElements, alpha: 1, y: '-=20', duration: 400, ease: 'Cubic.easeOut', delay: this.tweens.stagger(120) });

   // DÙNG 'once' THAY VÌ 'on' ĐỂ CHỐNG SPAM CLICK LÀM LOẠN DATA
    btnZone.once('pointerdown', () => {
        btnBg.clear(); btnBg.fillStyle(0x00b8d4, 1); btnBg.fillRoundedRect(-btnW/2, -btnH/2, btnW, btnH, 10);
        
        const gsRef = this.registry.get('gsRef');
        const progress = gsRef.current.campaignData.progress;
        
        // 1. LẤY CHUẨN XÁC VỊ TRÍ TỪ gsRef
        const pId = Number(progress.currentPlanet) || 1;
        const currStage = Number(progress.selectedStage) || 1;

        // 2. BẢO HIỂM CẤU TRÚC
        if (!progress.planets) progress.planets = {};
        if (!progress.planets[pId]) progress.planets[pId] = { highestStage: 1, stars: {} };
        if (!progress.planets[pId].stars) progress.planets[pId].stars = {};

        // 3. CẬP NHẬT SAO
        const oldStars = Number(progress.planets[pId].stars[currStage]) || 0;
        progress.planets[pId].stars[currStage] = Math.max(oldStars, earnedStars);

        // 4. MỞ KHÓA ẢI TIẾP THEO (Chỉ khi chơi đúng ải cao nhất hiện tại)
        const currentHighest = Number(progress.planets[pId].highestStage) || 1;
        if (currStage === currentHighest && currStage < 10) {
            progress.planets[pId].highestStage = currStage + 1;
            // Tự động đẩy selectedStage sang ải mới để người chơi bấm chơi tiếp luôn
            progress.selectedStage = currStage + 1;
        }

        // 5. CHUYỂN TINH CẦU MỚI KHI QUA ẢI 10
        if (currStage === 10 && currStage === currentHighest) {
            const nextPlanetId = pId + 1;
            if (nextPlanetId <= Object.keys(PLANET_CONFIG).length) {
               progress.highestPlanet = Math.max(Number(progress.highestPlanet) || 1, nextPlanetId);
               if (!progress.planets[nextPlanetId]) progress.planets[nextPlanetId] = { highestStage: 1, stars: {} };
               
               // Cập nhật selectedStage thành Ải 1 của Tinh cầu mới
               progress.currentPlanet = nextPlanetId;
               progress.selectedStage = 1;
            }
        }
        
        // 6. CỘNG EXP VÀ VÀNG THỰC TẾ
        if (progress.exp === undefined) progress.exp = 0; 
        progress.exp += earnedExp;                        
        gsRef.current.coins = (Number(gsRef.current.coins) || 0) + totalCoins;
        
        // 7. ÉP LƯU DATA LÊN FIREBASE NGAY LẬP TỨC 
        const saveUserProfile = this.registry.get('saveUserProfile');
        if (saveUserProfile) {
            saveUserProfile(); // Gọi hàm lưu của React
        }

        // 8. BẢO HIỂM TÀI KHOẢN KHÁCH (Lưu đúng key hệ thống astro_guest_campaign)
        try {
            window.localStorage.setItem('astro_guest_campaign', JSON.stringify(gsRef.current.campaignData));
            window.localStorage.setItem('astro_guest_coins', gsRef.current.coins.toString());
        } catch(e) { console.error("Lỗi lưu LocalStorage", e); }

        // 9. CHUYỂN MÀN
        this.time.delayedCall(200, () => {
             emitter.stop(); 
             this.registry.get('setScreen')('stage_select');
        });
    });
  }
  spawnEnemy() {
    const enemy = this.enemies.get(Phaser.Math.Between(40, this.scale.width - 40), -50);
    if (!enemy) return;

    let tier = 1;
    const rand = Math.random() * 100;
    if (this.currentStage >= 2 && rand > 50) tier = 2; 
    if (this.currentStage >= 4 && rand > 75) tier = 3; 
    if (this.currentStage >= 6 && rand > 85) tier = 4; 

    // --- LẤY DỮ LIỆU TỪ CONSTANTS ---
    const currentEnemies = PLANET_ENEMIES[this.currentPlanetId] || PLANET_ENEMIES[1];
    const enemyConfig = currentEnemies.find(e => e.tier === tier) || currentEnemies[0];
    
    // Ánh xạ sang hình vẽ tạm (fallback) nếu chưa có link ảnh
    const fallbackMap = { 1: 'fallback_enemy_small', 2: 'fallback_enemy_medium', 3: 'fallback_enemy_large', 4: 'fallback_enemy_kamikaze' };
    const tex = this.textures.exists(enemyConfig.id) ? enemyConfig.id : fallbackMap[tier];

    enemy.setTexture(tex);
    enemy.setActive(true).setVisible(true); enemy.body.enable = true; 
    enemy.body.setSize(enemy.width * 0.8, enemy.height * 0.8);
    
    if (tier === 4) {
      enemy.setVelocity(0, Phaser.Math.Between(enemyConfig.speedMin, enemyConfig.speedMax));
    } else {
      enemy.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(enemyConfig.speedMin, enemyConfig.speedMax)); 
    }
    
    enemy.tier = tier;
    
    // ÁP DỤNG MÁU TỪ CONFIG & TINH CẦU
    let baseHp = enemyConfig.baseHp + (this.currentStage * 15) + (this.currentWave * 5);
    enemy.maxHp = baseHp * (this.planetConfig.enemyHpBuff || 1);
    
    enemy.hp = enemy.maxHp;
    enemy.points = this.isReplay ? Math.max(1, Math.floor(enemyConfig.score / 2)) : enemyConfig.score; 
    enemy.isBoss = false;
    enemy.clearTint();

    enemy.canShoot = tier !== 4 && Math.random() > 0.5; 
    enemy.nextFire = this.time.now + Phaser.Math.Between(1000, 3000);
  }

 spawnBoss() {
    const bType = this.stageConfig.bossType || 'mech';
    const currentBosses = PLANET_BOSSES[this.currentPlanetId] || PLANET_BOSSES[1];
    
    // Nếu trong Tinh cầu đó không có loại boss này, lấy mặc định con đầu tiên
    const bossConfig = currentBosses[bType] || Object.values(currentBosses)[0]; 
    
    // Fallback nếu chưa có ảnh
    const fallbackTex = bType === 'alien' ? 'fallback_boss_alien' : 'fallback_boss_mech';
    const tex = this.textures.exists(bossConfig.id) ? bossConfig.id : fallbackTex;

    this.boss = this.physics.add.sprite(this.scale.width / 2, -150, tex);
    this.boss.setScale(bossConfig.scale); 
    
    this.boss.maxHp = bossConfig.baseHp * (this.planetConfig.enemyHpBuff || 1);
    
    this.boss.hp = this.boss.maxHp; 
    this.boss.isBoss = true; 
    this.boss.isEnraged = false; 
    this.boss.body.setSize(bossConfig.hitboxW, 100);
    this.boss.points = this.isReplay ? Math.max(10, Math.floor(bossConfig.score / 3)) : bossConfig.score; // Lấy điểm từ config
    this.enemies.add(this.boss);
    
    const targetY = 220; 
    this.tweens.add({ targets: this.boss, y: targetY, duration: 3000, ease: 'Power2' });
    this.tweens.add({ targets: this.boss, x: { min: 80, max: this.scale.width - 80 }, duration: bType === 'alien' ? 1500 : 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 3000 });
    this.tweens.add({ targets: this.boss, y: targetY + 30, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 3000 });
  }

  spawnDrop(x, y, type) {
    const drop = this.drops.get();
    if (!drop) return;
    drop.dType = type;
    if (type === 'coin') { drop.setTexture('drop_coin'); drop.setScale(1.2); }
    else if (type === 'heal') { drop.setTexture('drop_heal'); drop.setScale(1.2); }
    else if (type === 'power') { drop.setTexture('drop_power'); drop.setScale(1.2); }
    drop.enableBody(true, x, y, true, true);
    drop.body.updateFromGameObject();
    drop.setVelocity(0, 120); 
  }

  collectDrop(player, drop) {
    if (!drop.active) return;
    drop.setActive(false).setVisible(false); drop.body.enable = false;

    if (drop.dType === 'coin') {
      this.collectedCoins += 5;
      this.showTextEffect(player.x, player.y - 30, this.lang === 'vi' ? "+5 Xu" : "+5 Coins", '#f1c40f');
    } else if (drop.dType === 'heal') {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 200);
      this.updateHpBar();
      this.showTextEffect(player.x, player.y - 30, "+200 HP", '#2ecc71');
    } else if (drop.dType === 'power') {
      this.stats.mainAtk += 50; 
      this.showTextEffect(player.x, player.y - 30, this.lang === 'vi' ? "TĂNG SỨC MẠNH!" : "POWER UP!", '#3498db');
      this.time.delayedCall(5000, () => { this.stats.mainAtk -= 50; }); 
    }
  }

  spawnBullet(x, y, vx, vy, color, atk, bType = 'normal', target = null, texture = 'laser') {
    const b = this.bullets.get();
    if (!b) return;
    b.setTexture(texture);
    if (texture === 'laser' || texture === 'plasma') { b.setTint(color); b.setScale(texture === 'plasma' ? 1.5 : 1); }
    else { b.clearTint(); b.setScale(0.12); }
    b.enableBody(true, x, y, true, true);
    b.body.updateFromGameObject();
    b.setVelocity(vx, vy); b.atk = atk; b.bType = bType; b.target = target;
    b.setRotation(Math.atan2(vy, vx) + Math.PI / 2);
  }

  spawnEnemyBullet(x, y, vx, vy, texture = 'plasma') {
    const b = this.enemyBullets.get();
    if (!b) return;
    b.setTexture(texture); 
    if(texture === 'plasma') { b.setTint(0xff4757); b.setScale(1.5); }
    else { b.clearTint(); b.setScale(1); }
    b.enableBody(true, x, y, true, true);
    b.body.updateFromGameObject();
    b.setVelocity(vx, vy);
  }

  fireWeapons() {
    if (!this.stats.mainGunId) return;
    const gun = GEAR_CATALOG.mainGun.find(g => g.id === this.stats.mainGunId);
    if (!gun) return;
    const x = this.player.x; const y = this.player.y - 38; 
    const atk = this.stats.mainAtk; const color = gun.color || 0x00e5ff; const projType = gun.projectileType || 'laser';
    
    switch (gun.firePattern) {
      case 'spread3':
        this.spawnBullet(x, y, 0, -1220, color, atk, 'normal', null, projType);
        this.spawnBullet(x - 20, y + 10, -320, -1120, color, atk * 0.88, 'normal', null, projType);
        this.spawnBullet(x + 20, y + 10, 320, -1120, color, atk * 0.88, 'normal', null, projType); break;
      case 'homing':
        const target = this.enemies.getChildren().find(e => e.active && e.hp > 0);
        this.spawnBullet(x, y, 0, -1050, color, atk, 'homing', target || null, projType); break;
      default: this.spawnBullet(x, y, 0, -1300, color, atk, 'normal', null, projType);
    }
  }

  fireWingman() {
    if (!this.stats.wingmanId || this.drones.length === 0) return; 
    const wing = GEAR_CATALOG.wingman.find(w => w.id === this.stats.wingmanId);
    if (!wing) return;
    const activeEnemies = this.enemies.getChildren().filter(e => e.active && e.hp > 0);
    const target = activeEnemies.length > 0 ? activeEnemies[Phaser.Math.Between(0, activeEnemies.length - 1)] : null;
    const wingOffsetX = this.player.displayWidth * 0.42; const wingOffsetY = this.player.displayHeight * 0.18;
    this.drones.forEach((drone, index) => {
      const sideX = (index === 0) ? -wingOffsetX : wingOffsetX;
      this.spawnBullet(this.player.x + sideX, this.player.y + wingOffsetY, 0, -1000, wing.color, this.stats.wingAtk, 'homing', target, 'laser');
    });
  }

  fireDrones() {
    if (this.drones.length === 0) return;
    const activeEnemies = this.enemies.getChildren().filter(e => e.active && e.hp > 0);
    const target = activeEnemies.length > 0 ? activeEnemies[Phaser.Math.Between(0, activeEnemies.length - 1)] : null;
    this.drones.forEach(drone => {
        let vx = 0, vy = -1600;
        if (target) { const angle = Phaser.Math.Angle.Between(drone.x, drone.y, target.x, target.y); vx = Math.cos(angle) * 1550; vy = Math.sin(angle) * 1550; }
        this.spawnBullet(drone.x, drone.y - 15, vx, vy, drone.color, this.stats.droneAtk, 'sniper', target, drone.projectileType || 'laser');
    });
  }

  hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    enemy.hp -= bullet.atk;
    this.showTextEffect(enemy.x, enemy.y, `-${Math.round(bullet.atk)}`, '#ff4757');
    enemy.setTint(0xffffff);
    if (enemy.setTintMode) enemy.setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(50, () => { 
      if (enemy.active) { 
        if (enemy.isEnraged) {
          enemy.setTint(0xff5555); 
          if (enemy.setTintMode) enemy.setTintMode(Phaser.TintModes.MULTIPLY);
        } else {
          enemy.clearTint(); 
          if (enemy.setTintMode) enemy.setTintMode(Phaser.TintModes.MULTIPLY); 
        }
      } 
    });
    
    if (enemy.isBoss && enemy.hp <= enemy.maxHp * 0.3 && !enemy.isEnraged) {
      enemy.isEnraged = true;
      this.showAnnounce(this.lang === 'vi' ? 'CẢNH BÁO: TRÙM NỔI ĐIÊN!' : 'WARNING: BOSS ENRAGED!', '#ff0000', 3000);
      this.tweens.killTweensOf(enemy);
      const isAlien = this.stageConfig.bossType === 'alien';
      this.tweens.add({ targets: enemy, y: 220 + 30, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: enemy, x: { min: 80, max: this.scale.width - 80 }, duration: isAlien ? 800 : 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    if (bullet.bType !== 'plasma' && bullet.bType !== 'sniper') {
      bullet.setActive(false).setVisible(false); bullet.body.enable = false;
    }
    
    if (enemy.hp <= 0) {
      this.explode(enemy.x, enemy.y, 0xff4757, enemy.isBoss ? 4 : 1.5);
      this.score += enemy.points;
      this.score += enemy.isBoss ? bossReward : enemy.points;
      this.scoreText.setText(`${TEXTS.score[this.lang]}: ${this.score}`);
      
      const roll = Math.random() * 100;
      if (roll < 4) this.spawnDrop(enemy.x, enemy.y, 'power'); 
      else if (roll < 9) this.spawnDrop(enemy.x, enemy.y, 'heal'); 
      else if (roll < 20) this.spawnDrop(enemy.x, enemy.y, 'coin'); 

      enemy.setActive(false).setVisible(false); enemy.body.enable = false;
      if (enemy.isBoss) this.stageCleared();
    }
  }

  hitPlayer(player, hazard) {
    if (!hazard.active) return;
    let damage = 200;
    if (this.stats.armor) damage = Math.floor(damage * (1 - this.stats.armor / 100));
    
    if (hazard.texture.key === 'plasma') { hazard.setActive(false).setVisible(false); hazard.body.enable = false; } 
    else { hazard.hp -= 500; if (hazard.hp <= 0) { hazard.setActive(false).setVisible(false); hazard.body.enable = false; } }
    
    this.explode(player.x, player.y, 0xFFD700, 2);
    this.cameras.main.shake(200, 0.015);
    this.stats.hp -= damage;
    this.updateHpBar();
    
    if (this.stats.hp <= 0) {
      this.gameState = 'GAMEOVER'; this.physics.pause(); this.player.setVisible(false);
      this.engineFlareLeft.stop(); this.engineFlareRight.stop();
      if (this.drones && this.drones.length > 0) this.drones.forEach(d => d.setVisible(false));
      
      this.explode(this.player.x, this.player.y, 0xff0000, 4);
      this.showAnnounce(TEXTS.lost[this.lang], '#ff0000', 3000);
      this.time.delayedCall(4000, () => {
         const gsRef = this.registry.get('gsRef');
         gsRef.current.coins = (Number(gsRef.current.coins) || 0) + this.score + this.collectedCoins;
         const saveUserProfile = this.registry.get('saveUserProfile');
         if (saveUserProfile) saveUserProfile();
         this.registry.get('setScreen')('hq');
      });
    }
  }

  handleResize(gameSize) {
    if (this.gameState === 'GAMEOVER') return;
    const w = gameSize.width; const h = gameSize.height;
    this.bgGrid.setPosition(w / 2, h / 2); this.bgGrid.setSize(w, h * 2);
    this.physics.world.setBounds(0, 0, w, h);
    const targetWidth = Math.min(w * 0.5, 100);
    this.playerScale = targetWidth / (this.player.width || 1); this.player.setScale(this.playerScale);
    this.engineFlareLeft.startFollow(this.player, -this.player.displayWidth * 0.22, this.player.displayHeight * 0.40);
    this.engineFlareRight.startFollow(this.player, this.player.displayWidth * 0.22, this.player.displayHeight * 0.40);
    this.updateHUDLayout();
  }

  update(time, delta) {
    if (this.gameState === 'GAMEOVER' || this.gameState === 'CLEAR') return;
    this.bgGrid.y = (this.bgGrid.y + 2) % 50 + (this.scale.height / 2);
    
    if (this.drones && this.drones.length > 0) {
      const hoverY = Math.sin(this.time.now * 0.0045) * 9;
      this.drones.forEach(drone => { drone.x = Phaser.Math.Linear(drone.x, this.player.x + drone.offsetX, 0.25); drone.y = Phaser.Math.Linear(drone.y, this.player.y + drone.offsetY + hoverY, 0.25); });
    }
    
    if (time > this.nextMainFire) { this.fireWeapons(); this.nextMainFire = time + this.stats.mainFireRate; }
    if (this.stats.wingmanId && time > this.nextWingFire) { this.fireWingman(); this.nextWingFire = time + this.stats.wingFireRate; }
    if (this.stats.droneId && time > this.nextDroneFire) { this.fireDrones(); this.nextDroneFire = time + this.stats.droneFireRate; }
    // --- LOGIC HỒI MÁU TỰ ĐỘNG CỦA PHI CÔNG ---
    if (this.stats.hpRegenRate > 0 && time > this.nextHealTime && this.stats.hp < this.stats.maxHp) {
        // Tính lượng máu hồi mỗi giây
        const healAmount = Math.ceil(this.stats.maxHp * this.stats.hpRegenRate); 
        // Cộng máu nhưng không được vượt quá máu tối đa
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + healAmount);
        
        this.updateHpBar(); // Cập nhật lại thanh máu màu xanh trên góc màn hình
        
        // Hiển thị chữ + Máu màu xanh lá bay lên cho đẹp
        this.showTextEffect(this.player.x, this.player.y - 30, `+${healAmount}`, '#2ecc71');
        
        // Đặt lịch 1000ms (1 giây) sau mới hồi tiếp
        this.nextHealTime = time + 1000; 
    }
    
    const width = this.scale.width; const height = this.scale.height;

    this.enemyHpGraphics.clear();
    this.enemies.getChildren().forEach(e => {
        if (!e.active || e.y < 0) return; 
        const ratio = Math.max(0, e.hp / e.maxHp);
        if (e.isBoss) {
            const w = 150; const h = 8; const yOffset = e.displayHeight / 2 + 25;
            this.enemyHpGraphics.fillStyle(0xff4757, 0.8); this.enemyHpGraphics.fillRect(e.x - w/2, e.y - yOffset, w, h);
            this.enemyHpGraphics.fillStyle(0x2ecc71, 1); this.enemyHpGraphics.fillRect(e.x - w/2, e.y - yOffset, w * ratio, h);
            this.enemyHpGraphics.lineStyle(2, 0xffffff, 1); this.enemyHpGraphics.strokeRect(e.x - w/2, e.y - yOffset, w, h);
        } else {
            const w = 40; const h = 4; const yOffset = e.displayHeight / 2 + 10;
            this.enemyHpGraphics.fillStyle(0xff4757, 0.8); this.enemyHpGraphics.fillRect(e.x - w/2, e.y - yOffset, w, h);
            this.enemyHpGraphics.fillStyle(0x2ecc71, 1); this.enemyHpGraphics.fillRect(e.x - w/2, e.y - yOffset, w * ratio, h);
        }
    });

    if (this.gameState === 'PLAYING') {
      if (this.enemiesSpawned < this.enemiesToSpawn) {
        if (time > this.nextEnemySpawn) {
          this.spawnEnemy();
          this.enemiesSpawned++;
          this.nextEnemySpawn = time + Math.max(300, 1500 - (this.currentStage * 100 + this.currentWave * 50));
        }
      }
      else if (this.enemies.countActive(true) === 0) { 
        if (this.currentWave < this.maxWaves) {
          this.gameState = 'TRANSITION';
          this.showAnnounce(TEXTS.clear[this.lang], '#2ecc71', 1000);
          this.currentWave++;
          this.time.delayedCall(2000, () => this.startWave());
        }
        else if (!this.stageConfig.hasBoss) { this.stageCleared(); }
      }
    }
    
    if (this.gameState === 'BOSS_FIGHT' && this.boss && this.boss.active) {
      if (time > this.nextBossFire) {
        const isAlien = this.stageConfig.bossType === 'alien';
        const attackType = Phaser.Math.Between(1, 3);
        if (attackType === 1) { 
           for(let i = -3; i <= 3; i++) { this.spawnEnemyBullet(this.boss.x, this.boss.y + 40, i * 150, 450); }
        } else if (attackType === 2) { 
           const bullets = isAlien ? 16 : 8; 
           for(let a = 0; a < Math.PI * 2; a += Math.PI * 2 / bullets) { 
               this.spawnEnemyBullet(this.boss.x, this.boss.y, Math.cos(a)*(isAlien?400:300), Math.sin(a)*(isAlien?400:300)); 
           }
        } else { 
           const angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
           this.spawnEnemyBullet(this.boss.x, this.boss.y + 40, Math.cos(angle)*700, Math.sin(angle)*700);
        }
        let nextDelay = isAlien ? Phaser.Math.Between(600, 1200) : Phaser.Math.Between(1000, 2000);
        if (this.boss.isEnraged) nextDelay *= 0.5; 
        this.nextBossFire = time + nextDelay;
      }
    }

    this.bullets.getChildren().forEach(b => {
      if (!b.active) return;
      if (b.bType === 'homing' && b.target && b.target.active) {
        if (Phaser.Math.Distance.Between(b.x, b.y, b.target.x, b.target.y) < 40) this.hitEnemy(b, b.target);
        else { this.physics.moveToObject(b, b.target, 550); b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x) + Math.PI / 2); }
      }
      if (b.y < -50 || b.y > height + 50 || b.x < -50 || b.x > width + 50) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });

    this.enemies.getChildren().forEach(e => {
      if (!e.active || e.isBoss) return;
      if (!e.canShoot) {
         const speed = e.tier === 4 ? 280 : 150; 
         this.physics.moveToObject(e, this.player, speed);
         e.setRotation(Math.atan2(this.player.y - e.y, this.player.x - e.x) - Math.PI / 2);
      } else {
         e.setRotation(0); 
         if (e.y < 40 && e.body.velocity.y < 0) e.body.velocity.y = Math.abs(e.body.velocity.y);
         if (e.y > height * 0.65 && e.body.velocity.y > 0) e.body.velocity.y = -Math.abs(e.body.velocity.y); 
         if (e.x < 30 && e.body.velocity.x < 0) e.body.velocity.x = Math.abs(e.body.velocity.x || 100);
         if (e.x > width - 30 && e.body.velocity.x > 0) e.body.velocity.x = -Math.abs(e.body.velocity.x || 100);

         if (time > e.nextFire) {
            const angle = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
            this.spawnEnemyBullet(e.x, e.y + 20, Math.cos(angle) * 350, Math.sin(angle) * 350);
            e.nextFire = time + 3000; 
         }
      }
    });

    this.enemyBullets.getChildren().forEach(b => {
      if (b.active && (b.y > height + 50 || b.y < -50 || b.x < -50 || b.x > width + 50)) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });

    this.drops.getChildren().forEach(d => {
       if (d.active && d.y > height + 50) { d.setActive(false).setVisible(false); d.body.enable = false; }
    });
  }
}