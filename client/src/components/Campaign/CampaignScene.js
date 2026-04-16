import * as Phaser from 'phaser';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS } from '../../constants';

// CẤU HÌNH SỐ ĐỢT LÍNH CHO TỪNG MÀN CHƠI
const STAGE_CONFIG = {
  1: { waves: 5, baseEnemies: 5 },
  2: { waves: 5, baseEnemies: 8 },
  3: { waves: 7, baseEnemies: 10 },
  4: { waves: 7, baseEnemies: 15 },
  5: { waves: 10, baseEnemies: 20, hasBoss: true }
};

// 👇 TỪ ĐIỂN SONG NGỮ CHO CHIẾN DỊCH
const TEXTS = {
  score: { vi: 'ĐIỂM', en: 'SCORE' },
  armor: { vi: 'HỆ THỐNG GIÁP', en: 'ARMOR SYSTEM' },
  retreat: { vi: '◀ RÚT LUI', en: '◀ RETREAT' },
  bossWarn: { vi: 'CẢNH BÁO:\nTRÙM CUỐI XUẤT HIỆN!', en: 'WARNING:\nBOSS APPROACHING!' },
  waveStart: { vi: 'TIẾN VÀO ĐỢT', en: 'ENTERING WAVE' },
  clear: { vi: 'DỌN SẠCH!', en: 'SECTOR CLEARED!' },
  campaignClear: { vi: 'HOÀN THÀNH\nCHIẾN DỊCH!', en: 'CAMPAIGN\nCLEARED!' },
  lost: { vi: 'MẤT LIÊN LẠC!', en: 'CONNECTION LOST!' }
};

export default class CampaignScene extends Phaser.Scene {
  constructor() {
    super('CampaignScene');
  }

  preload() {
    const gsRef = this.registry.get('gsRef');
    const { items, loadout } = gsRef.current.campaignData;
    const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
    
    this.load.image('player_ship_img', aircraftBase.imgTop || '/images/ship_xwing_top.jpg');
    
    const wingmanItem = items[loadout.wingman];
    const wingmanBase = wingmanItem ? GEAR_CATALOG.wingman.find(g => g.id === wingmanItem.baseId) : null;
    if (wingmanBase && wingmanBase.imgSrc) this.load.image(wingmanBase.id, wingmanBase.imgSrc); 

    const droneItem = items[loadout.drone];
    const droneBase = droneItem && GEAR_CATALOG.drone ? GEAR_CATALOG.drone.find(g => g.id === droneItem.baseId) : null;
    if (droneBase && droneBase.imgSrc) this.load.image(droneBase.id, droneBase.imgSrc); 

    const eG = this.add.graphics();
    eG.fillStyle(0x1a0510, 1); eG.lineStyle(2, 0xff4757, 1);
    eG.beginPath(); eG.moveTo(25, 50); eG.lineTo(50, 20); eG.lineTo(40, 0); eG.lineTo(10, 0); eG.lineTo(0, 20); eG.closePath();
    eG.fillPath(); eG.strokePath(); eG.fillStyle(0xff4757, 0.8); eG.fillCircle(25, 20, 6);
    eG.generateTexture('enemy_ship', 50, 50); eG.destroy();

    const bG = this.add.graphics();
    bG.fillStyle(0x300000, 1); bG.lineStyle(4, 0xff0000, 1);
    bG.beginPath(); bG.moveTo(50, 0); bG.lineTo(100, 30); bG.lineTo(100, 90); bG.lineTo(50, 120); bG.lineTo(0, 90); bG.lineTo(0, 30); bG.closePath();
    bG.fillPath(); bG.strokePath();
    bG.fillStyle(0xff0000, 1); bG.fillCircle(50, 60, 20); 
    bG.generateTexture('boss_placeholder', 100, 120); bG.destroy();

    const lG = this.add.graphics();
    lG.fillStyle(0xffffff, 1); lG.fillRoundedRect(0, 0, 6, 24, 3);
    lG.generateTexture('laser', 6, 24); lG.destroy();

    const pG = this.add.graphics();
    pG.fillStyle(0xffffff, 1); pG.fillCircle(8, 8, 8);
    pG.generateTexture('plasma', 16, 16); pG.destroy();

    const fG = this.add.graphics();
    fG.fillStyle(0xffffff, 1); fG.fillCircle(8, 8, 8);
    fG.generateTexture('flare', 16, 16); fG.destroy();

    const dG = this.add.graphics();
    dG.fillStyle(0x0a192f, 1); dG.lineStyle(2, 0x2ecc71, 1);
    dG.beginPath(); dG.moveTo(10,0); dG.lineTo(20,10); dG.lineTo(10,20); dG.lineTo(0,10); dG.closePath();
    dG.fillPath(); dG.strokePath();
    dG.fillStyle(0x2ecc71, 0.8); dG.fillCircle(10, 10, 3); 
    dG.generateTexture('drone_img', 20, 20); dG.destroy();
  }

  create() {
    const gsRef = this.registry.get('gsRef');
    const { items, loadout, progress } = gsRef.current.campaignData;

    // 👇 Tự động đọc ngôn ngữ từ Registry hoặc LocalStorage
    this.lang = this.registry.get('lang') || window.localStorage.getItem('astro_lang') || 'vi';

    const targetStage = progress.selectedStage || progress.currentStage || 1;
    this.currentStage = Math.min(targetStage, 5);
    this.stageConfig = STAGE_CONFIG[this.currentStage];
    this.maxWaves = this.stageConfig.waves;
    this.currentWave = 1;
    this.gameState = 'TRANSITION'; 
    
    this.enemiesToSpawn = this.stageConfig.baseEnemies + (this.currentWave * 2);
    this.enemiesSpawned = 0;

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

    let mainAtkMult = pilotBase.id === 'pilot_alpha' ? 1.1 : 1;
    let wingRateMult = pilotBase.id === 'pilot_fox' ? 0.8 : 1;
    const armorHp = armorBase ? armorBase.baseHp + (armorItem.level * 15) * armorItem.rarity : 0;
    
    this.stats = {
      hp: aircraftBase.baseHp + armorHp, maxHp: aircraftBase.baseHp + armorHp,
      mainAtk: mainGunBase ? (mainGunBase.baseAtk + (mainGunItem.level * 3) * mainGunItem.rarity) * mainAtkMult : 10, 
      wingAtk: wingmanBase ? (wingmanBase.baseAtk + (wingmanItem.level * 3) * wingmanItem.rarity) : 0,
      droneAtk: droneBase ? (droneBase.baseAtk + (droneItem.level * 3) * droneItem.rarity) : 0,
      mainFireRate: mainGunBase ? mainGunBase.fireRate * 1000 : 400,
      wingFireRate: 600 * wingRateMult, droneFireRate: 800, 
      mainGunId: mainGunBase ? mainGunBase.id : 'gun_laser',
      wingmanId: wingmanBase ? wingmanBase.id : null,
      droneId: droneBase ? droneBase.id : null, pilotId: pilotBase.id
    };

    this.score = 0; 
    this.nextEnemySpawn = 0; this.nextMainFire = 0; this.nextWingFire = 0; this.nextDroneFire = 0;
    this.nextBossFire = 0;

    const width = this.scale.width; const height = this.scale.height;
    this.bgGrid = this.add.grid(width/2, height/2, width, height * 2, 50, 50, 0x020c1b, 1, 0x00e5ff, 0.1);
    
    this.bullets = this.physics.add.group({ defaultKey: 'laser', maxSize: 500 });
    this.enemies = this.physics.add.group({ defaultKey: 'enemy_ship', maxSize: 50 });
    this.enemyBullets = this.physics.add.group({ defaultKey: 'plasma', maxSize: 200 });

    this.player = this.physics.add.sprite(width / 2, height - 100, 'player_ship_img');
    const targetWidth = Math.min(width * 0.5, 280); 
    const pWidth = this.player.width || 1;
    this.playerScale = targetWidth / pWidth;
    this.player.setScale(this.playerScale); 
    
    const hitBoxWidth = this.player.width * 0.3; const hitBoxHeight = this.player.height * 0.5;
    this.player.body.setSize(hitBoxWidth, hitBoxHeight); 
    this.player.body.setOffset((this.player.width - hitBoxWidth)/2, (this.player.height - hitBoxHeight)/2 + 20);
    this.player.setCollideWorldBounds(true);
    
    if (this.stats.armorId === 'armor_shield') {
      this.shieldGlow = this.add.circle(this.player.x, this.player.y, targetWidth * 0.8, 0x00e5ff, 0.1);
      this.shieldGlow.setStrokeStyle(2, 0x00e5ff, 0.5);
      this.tweens.add({ targets: this.shieldGlow, alpha: 0.3, yoyo: true, repeat: -1, duration: 1000 });
    }

    if (this.stats.droneId) {
      const droneTexture = this.textures.exists(this.stats.droneId) ? this.stats.droneId : 'drone_img';
      this.leftDrone = this.add.sprite(this.player.x - 60, this.player.y + 20, droneTexture);
      this.rightDrone = this.add.sprite(this.player.x + 60, this.player.y + 20, droneTexture);
      this.leftDrone.setScale(0.06); this.rightDrone.setScale(0.06);
    }

    this.player.setInteractive(); this.input.setDraggable(this.player);
    this.input.on('drag', (pointer, obj, dragX, dragY) => {
        if (this.gameState === 'GAMEOVER') return;
        obj.x = dragX; obj.y = dragY - 40; 
    });

    const engineOffsetX = this.player.displayWidth * 0.22; const engineOffsetY = this.player.displayHeight * 0.40;
    const flareConf = { speed: 200, angle: 90, scale: { start: 0.6 * this.playerScale, end: 0 }, alpha: { start: 0.8, end: 0 }, blendMode: 'ADD', tint: 0x00e5ff, lifespan: 200 };
    this.engineFlareLeft = this.add.particles(0, 0, 'flare', flareConf).startFollow(this.player, -engineOffsetX, engineOffsetY);
    this.engineFlareRight = this.add.particles(0, 0, 'flare', flareConf).startFollow(this.player, engineOffsetX, engineOffsetY);

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, null, this);
    this.physics.add.overlap(this.player, this.enemyBullets, this.hitPlayer, null, this);

    // ==========================================
    // 🚀 HỆ THỐNG GIAO DIỆN CHỈ HUY BILINGUAL
    // ==========================================
    this.hudGraphics = this.add.graphics().setDepth(99);
    this.hpBarBg = this.add.graphics().setDepth(100); 
    this.hpBar = this.add.graphics().setDepth(100);
    
    this.scoreText = this.add.text(0, 0, `${TEXTS.score[this.lang]}: 0`, { fontFamily: '"VT323", monospace', color: '#00e5ff' }).setDepth(100);
    this.waveText = this.add.text(0, 0, '', { fontFamily: '"VT323", monospace', color: '#f1c40f' }).setOrigin(1, 0).setDepth(100);
    this.hpText = this.add.text(0, 0, TEXTS.armor[this.lang], { fontFamily: '"VT323", monospace', color: '#fff' }).setOrigin(0.5, 0.5).setDepth(101);

    // this.retreatBtn = this.add.text(15, 60, TEXTS.retreat[this.lang], { 
    //   fontFamily: '"VT323", monospace', fontSize: '20px', color: '#ff4757',
    //   backgroundColor: 'rgba(255, 71, 87, 0.15)', padding: { x: 10, y: 5 }
    // }).setDepth(100).setInteractive();

    // this.retreatBtn.on('pointerover', () => this.retreatBtn.setBackgroundColor('rgba(255, 71, 87, 0.4)'));
    // this.retreatBtn.on('pointerout', () => this.retreatBtn.setBackgroundColor('rgba(255, 71, 87, 0.15)'));
    // this.retreatBtn.on('pointerdown', () => {
    //     if (this.gameState === 'GAMEOVER' || this.gameState === 'CLEAR') return;
    //     this.gameState = 'GAMEOVER'; 
    //     this.physics.pause(); 
    //     this.registry.get('setScreen')('stage_select'); 
    // });

    this.announceBg = this.add.graphics().setDepth(199).setAlpha(0);
    this.announceText = this.add.text(width/2, height/3, '', { 
      fontFamily: '"VT323", monospace', color: '#fff', fontStyle: 'bold', align: 'center' 
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

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
    this.hudGraphics.moveTo(0, 0);
    this.hudGraphics.lineTo(w, 0);
    this.hudGraphics.lineTo(w, 35);
    this.hudGraphics.lineTo(w/2 + 90, 35);
    this.hudGraphics.lineTo(w/2 + 70, 65);
    this.hudGraphics.lineTo(w/2 - 70, 65);
    this.hudGraphics.lineTo(w/2 - 90, 35);
    this.hudGraphics.lineTo(0, 35);
    this.hudGraphics.closePath();
    this.hudGraphics.fillPath();
    this.hudGraphics.strokePath();

    this.scoreText.setPosition(15, 10);
    this.waveText.setPosition(w - 15, 10);
    this.hpText.setPosition(w/2, 22);

    this.updateHpBar();
  }

  updateHpBar() {
    const w = this.scale.width;
    const ratio = Math.max(0, this.stats.hp / this.stats.maxHp);
    const barW = 120; const barH = 12;
    const x = w / 2 - barW / 2;
    const y = 40; 

    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x000000, 0.8);
    this.hpBarBg.lineStyle(1, 0x00e5ff, 0.4);
    this.hpBarBg.fillRect(x, y, barW, barH);
    this.hpBarBg.strokeRect(x, y, barW, barH);

    this.hpBar.clear();
    const color = ratio > 0.5 ? 0x00e5ff : (ratio > 0.25 ? 0xf1c40f : 0xff4757);
    this.hpBar.fillStyle(color, 1);
    
    const segments = 10;
    const segWidth = barW / segments;
    const gap = 2;
    for (let i = 0; i < segments; i++) {
      if (i * segWidth >= barW * ratio) break;
      let drawW = Math.min(segWidth - gap, (barW * ratio) - (i * segWidth));
      if (drawW > 0) {
        this.hpBar.fillRect(x + i * segWidth + gap/2, y + 2, drawW, barH - 4);
      }
    }
  }

  // 👇 ĐÃ FIX LỖI: Tự động đo Text để vẽ khung bọc vừa vặn!
  showAnnounce(text, color = '#66fcf1', duration = 2000) {
    const w = this.scale.width;
    const h = this.scale.height;
    
    // Ép font size nhỏ hơn để tránh chữ to quá khổ
    const maxFontSize = 35; 
    const calcFontSize = Math.max(20, Math.min(maxFontSize, w * 0.07)); 
    
    this.announceText.setFontSize(`${calcFontSize}px`);
    this.announceText.setWordWrapWidth(w * 0.85); // Khóa wrap text ở 85% chiều rộng
    this.announceText.setText(text).setColor(color);
    
    // Ép Phaser tính toán lại kích thước thật của Text sau khi gán
    this.announceText.updateText(); 
    const actualTextHeight = this.announceText.height; 

    // Vẽ hộp bao quanh dựa trên chiều cao thật của text
    this.announceBg.clear();
    this.announceBg.fillStyle(0x050b14, 0.9);
    this.announceBg.lineStyle(2, Phaser.Display.Color.HexStringToColor(color).color, 0.8);
    
    const paddingY = 20; // Khoảng cách trên dưới viền so với chữ
    const bgY = (h / 3) - (actualTextHeight / 2) - paddingY;
    const bgH = actualTextHeight + (paddingY * 2);
    
    this.announceBg.fillRect(0, bgY, w, bgH);
    this.announceBg.beginPath();
    this.announceBg.moveTo(0, bgY); this.announceBg.lineTo(w, bgY);
    this.announceBg.moveTo(0, bgY + bgH); this.announceBg.lineTo(w, bgY + bgH);
    this.announceBg.strokePath();

    this.tweens.add({ targets: [this.announceText, this.announceBg], alpha: 1, yoyo: true, hold: duration, duration: 400 });
  }

  startWave() {
    // Hiển thị Wave dạng Đa ngôn ngữ
    const waveStr = this.lang === 'vi' 
      ? `ẢI ${this.currentStage} | ĐỢT ${this.currentWave}/${this.maxWaves}`
      : `STAGE ${this.currentStage} | WAVE ${this.currentWave}/${this.maxWaves}`;
      
    this.waveText.setText(waveStr);
    
    if (this.currentStage === 5 && this.currentWave === this.maxWaves && this.stageConfig.hasBoss) {
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
    this.showAnnounce(TEXTS.campaignClear[this.lang], '#2ecc71', 4000);
    
    this.time.delayedCall(4500, () => {
      const gsRef = this.registry.get('gsRef');
      const progress = gsRef.current.campaignData.progress;
      
      if (progress.currentStage === this.currentStage && this.currentStage < 5) {
         progress.currentStage++;
         progress.selectedStage = progress.currentStage; 
      }
      gsRef.current.coins = (Number(gsRef.current.coins) || 0) + (this.currentStage * 1000) + this.score;
      this.registry.get('setScreen')('stage_select'); 
    });
  }

  spawnEnemy() {
    const enemy = this.enemies.get(Phaser.Math.Between(40, this.scale.width - 40), -50);
    if (!enemy) return; 
    enemy.setTexture('enemy_ship');
    enemy.setActive(true).setVisible(true); enemy.body.enable = true; enemy.body.setSize(40, 40);
    enemy.setVelocityY(Phaser.Math.Between(150, 300));
    enemy.hp = 50 + (this.currentStage * 20) + (this.currentWave * 5); 
    enemy.isBoss = false;
    enemy.clearTint();
  }

  spawnBoss() {
    this.boss = this.physics.add.sprite(this.scale.width / 2, -150, 'boss_placeholder');
    this.boss.setScale(1.5);
    this.boss.hp = 15000; this.boss.maxHp = 15000;
    this.boss.isBoss = true;
    this.boss.body.setSize(80, 100);
    this.enemies.add(this.boss);

    this.tweens.add({ targets: this.boss, y: 150, duration: 3000, ease: 'Power2' });
    this.tweens.add({ targets: this.boss, x: { min: 80, max: this.scale.width - 80 }, duration: 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 3000 });
  }

  spawnEnemyBullet(x, y, vx, vy) {
    const b = this.enemyBullets.get();
    if (!b) return;
    b.setTexture('plasma'); b.setTint(0xff4757); b.setScale(1.5);
    b.enableBody(true, x, y, true, true);
    b.body.updateFromGameObject();
    b.setVelocity(vx, vy);
  }

  handleResize(gameSize) {
    if (this.gameState === 'GAMEOVER') return;
    const w = gameSize.width; const h = gameSize.height;
    this.bgGrid.setPosition(w/2, h/2); this.bgGrid.setSize(w, h*2);
    this.physics.world.setBounds(0, 0, w, h);
    
    const targetWidth = Math.min(w * 0.5, 280); 
    const pWidth = this.player.width || 1;
    this.playerScale = targetWidth / pWidth;
    this.player.setScale(this.playerScale);
    
    const engineOffsetX = this.player.displayWidth * 0.22; const engineOffsetY = this.player.displayHeight * 0.40;
    this.engineFlareLeft.startFollow(this.player, -engineOffsetX, engineOffsetY);
    this.engineFlareRight.startFollow(this.player, engineOffsetX, engineOffsetY);

    this.updateHUDLayout();
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
    b.setRotation(Math.atan2(vy, vx) + Math.PI/2);
  }

  fireWeapons() {
    const x = this.player.x; const y = this.player.y - 30; const atk = this.stats.mainAtk;
    if (this.stats.mainGunId === 'gun_spread') {
      this.spawnBullet(x, y, 0, -1000, 0x00e5ff, atk, 'normal', null, 'laser');
      this.spawnBullet(x - 15, y + 10, -300, -900, 0x00e5ff, atk, 'normal', null, 'laser');
      this.spawnBullet(x + 15, y + 10, 300, -900, 0x00e5ff, atk, 'normal', null, 'laser');
    } else if (this.stats.mainGunId === 'gun_plasma') {
      this.spawnBullet(x, y, 0, -600, 0x9b59b6, atk * 1.5, 'plasma', null, 'plasma');
    } else {
      this.spawnBullet(x, y, 0, -1200, 0xff4757, atk, 'normal', null, 'laser');
    }
  }

  fireWingman() {
    const activeEnemies = this.enemies.getChildren().filter(e => e.active);
    const target = activeEnemies.length > 0 ? activeEnemies[Math.floor(Math.random() * activeEnemies.length)] : null;
    const wingOffsetX = this.player.displayWidth * 0.40; const wingOffsetY = this.player.displayHeight * 0.15; 
    if (this.stats.wingmanId) {
      const textureKey = this.textures.exists(this.stats.wingmanId) ? this.stats.wingmanId : 'laser';
      this.spawnBullet(this.player.x - wingOffsetX, this.player.y + wingOffsetY, -150, -500, 0xffffff, this.stats.wingAtk, 'homing', target, textureKey);
      this.spawnBullet(this.player.x + wingOffsetX, this.player.y + wingOffsetY, 150, -500, 0xffffff, this.stats.wingAtk, 'homing', target, textureKey);
    }
  }

  fireDrone() {
    if (!this.leftDrone || !this.rightDrone) return;
    if (this.stats.droneId === 'drone_sniper') {
      const activeEnemies = this.enemies.getChildren().filter(e => e.active);
      const target = activeEnemies.length > 0 ? activeEnemies[Math.floor(Math.random() * activeEnemies.length)] : null;
      let vxL = 0, vyL = -2000, vxR = 0, vyR = -2000;
      if (target) {
        const angleL = Phaser.Math.Angle.Between(this.leftDrone.x, this.leftDrone.y, target.x, target.y);
        const angleR = Phaser.Math.Angle.Between(this.rightDrone.x, this.rightDrone.y, target.x, target.y);
        vxL = Math.cos(angleL) * 1500; vyL = Math.sin(angleL) * 1500;
        vxR = Math.cos(angleR) * 1500; vyR = Math.sin(angleR) * 1500;
      }
      this.spawnBullet(this.leftDrone.x, this.leftDrone.y - 15, vxL, vyL, 0x2ecc71, this.stats.droneAtk, 'sniper', null, 'laser');
      this.spawnBullet(this.rightDrone.x, this.rightDrone.y - 15, vxR, vyR, 0x2ecc71, this.stats.droneAtk, 'sniper', null, 'laser');
    }
  }

  showDamage(x, y, dmg) {
    const txt = this.add.text(x, y, `-${dmg}`, { fontFamily: '"VT323", monospace', fontSize: '24px', color: '#FFD700' }).setOrigin(0.5);
    this.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 500, onComplete: () => txt.destroy() });
  }

  explode(x, y, color, scale = 1) {
    const emitter = this.add.particles(x, y, 'flare', { speed: { min: 100, max: 400 }, angle: { min: 0, max: 360 }, scale: { start: 0.5 * scale, end: 0 }, blendMode: 'ADD', tint: color, lifespan: 300, quantity: 15 });
    emitter.explode();
  }

  hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    
    enemy.hp -= bullet.atk;
    this.showDamage(enemy.x, enemy.y, bullet.atk);
    
    enemy.setTint(0xffffff);
    if (enemy.setTintMode) enemy.setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(50, () => { 
      if (enemy.active) { enemy.clearTint(); if (enemy.setTintMode) enemy.setTintMode(Phaser.TintModes.MULTIPLY); }
    });

    if (bullet.bType !== 'plasma' && bullet.bType !== 'sniper') {
      bullet.setActive(false).setVisible(false); bullet.body.enable = false;
      if (bullet.texture.key.includes('rocket') || bullet.texture.key.includes('wing')) this.explode(bullet.x, bullet.y, 0xffa502, 1.2); 
    }

    if (enemy.hp <= 0) {
      this.explode(enemy.x, enemy.y, 0xff4757, enemy.isBoss ? 4 : 1.5);
      this.score += enemy.isBoss ? 1000 : 10; 
      
      // Update score string biligually
      this.scoreText.setText(`${TEXTS.score[this.lang]}: ${this.score}`);
      
      enemy.setActive(false).setVisible(false); enemy.body.enable = false;
      
      if (enemy.isBoss) {
         this.stageCleared();
      }
    }
  }

  hitPlayer(player, hazard) {
    if (!hazard.active) return;
    
    if (hazard.texture.key === 'plasma') {
       hazard.setActive(false).setVisible(false); hazard.body.enable = false;
    } else {
       hazard.hp -= 500; 
       if (hazard.hp <= 0) { hazard.setActive(false).setVisible(false); hazard.body.enable = false; }
    }

    this.explode(player.x, player.y, 0xFFD700, 2); this.cameras.main.shake(200, 0.015);
    this.stats.hp -= 200; this.updateHpBar();

    if (this.stats.hp <= 0) {
      this.gameState = 'GAMEOVER'; this.physics.pause(); this.player.setVisible(false);
      this.engineFlareLeft.stop(); this.engineFlareRight.stop();
      if (this.leftDrone) { this.leftDrone.setVisible(false); this.rightDrone.setVisible(false); }
      this.explode(this.player.x, this.player.y, 0xff0000, 4);
      
      this.showAnnounce(TEXTS.lost[this.lang], '#ff0000', 3000);
      this.time.delayedCall(4000, () => this.registry.get('setScreen')('hq'));
    }
  }

  update(time, delta) {
    if (this.gameState === 'GAMEOVER' || this.gameState === 'CLEAR') return;

    this.bgGrid.y = (this.bgGrid.y + 2) % 50 + (this.scale.height / 2);

    if (this.leftDrone && this.rightDrone) {
      const hoverY = Math.sin(time * 0.005) * 10; 
      const droneOffsetX = this.player.displayWidth * 0.65; 
      this.leftDrone.x = Phaser.Math.Linear(this.leftDrone.x, this.player.x - droneOffsetX, 0.2);
      this.leftDrone.y = Phaser.Math.Linear(this.leftDrone.y, this.player.y + 15 + hoverY, 0.2);
      this.rightDrone.x = Phaser.Math.Linear(this.rightDrone.x, this.player.x + droneOffsetX, 0.2);
      this.rightDrone.y = Phaser.Math.Linear(this.rightDrone.y, this.player.y + 15 + hoverY, 0.2);
    }

    if (this.stats.pilotId === 'pilot_bear' && Math.random() < 0.016) {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.01);
      this.updateHpBar();
    }

    if (time > this.nextMainFire) { this.fireWeapons(); this.nextMainFire = time + this.stats.mainFireRate; }
    if (this.stats.wingmanId && time > this.nextWingFire) { this.fireWingman(); this.nextWingFire = time + this.stats.wingFireRate; }
    if (this.stats.droneId && time > this.nextDroneFire) { this.fireDrone(); this.nextDroneFire = time + this.stats.droneFireRate; }

    if (this.gameState === 'PLAYING') {
      if (this.enemiesSpawned < this.enemiesToSpawn) {
        if (time > this.nextEnemySpawn) {
          this.spawnEnemy();
          this.enemiesSpawned++;
          this.nextEnemySpawn = time + Math.max(500, 1500 - (this.currentStage * 100 + this.currentWave * 50)); 
        }
      } 
      else if (this.enemies.countActive(true) === 0) {
        if (this.currentWave < this.maxWaves) {
          this.gameState = 'TRANSITION';
          this.showAnnounce(TEXTS.clear[this.lang], '#2ecc71', 1000);
          this.currentWave++;
          this.time.delayedCall(2000, () => this.startWave());
        } 
        else if (this.currentStage !== 5) {
          this.stageCleared();
        }
      }
    }

    if (this.gameState === 'BOSS_FIGHT' && this.boss && this.boss.active) {
       if (time > this.nextBossFire) {
          this.spawnEnemyBullet(this.boss.x, this.boss.y + 40, -150, 400); 
          this.spawnEnemyBullet(this.boss.x, this.boss.y + 40, 150, 400);  
          this.spawnEnemyBullet(this.boss.x, this.boss.y + 40, 0, 500);    
          this.nextBossFire = time + 1200;
       }
    }

    const width = this.scale.width; const height = this.scale.height;

    this.bullets.getChildren().forEach(b => {
      if (!b.active) return;
      if (b.bType === 'homing' && b.target && b.target.active) {
        if (Phaser.Math.Distance.Between(b.x, b.y, b.target.x, b.target.y) < 40) this.hitEnemy(b, b.target);
        else {
           this.physics.moveToObject(b, b.target, 550);
           b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x) + Math.PI/2);
        }
      }
      if (b.y < -50 || b.y > height + 50 || b.x < -50 || b.x > width + 50) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });

    this.enemies.getChildren().forEach(e => {
      if (e.active && e.y > height + 50) { e.setActive(false).setVisible(false); e.body.enable = false; }
    });

    this.enemyBullets.getChildren().forEach(b => {
      if (b.active && (b.y > height + 50 || b.x < -50 || b.x > width + 50)) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });
  }
}