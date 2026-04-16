import * as Phaser from 'phaser';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS } from '../../constants';

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
    if (wingmanBase && wingmanBase.imgSrc) {
      this.load.image(wingmanBase.id, wingmanBase.imgSrc); 
    }

    const eG = this.add.graphics();
    eG.fillStyle(0x1a0510, 1); eG.lineStyle(2, 0xff4757, 1);
    eG.beginPath(); eG.moveTo(25, 50); eG.lineTo(50, 20); eG.lineTo(40, 0); eG.lineTo(10, 0); eG.lineTo(0, 20); eG.closePath();
    eG.fillPath(); eG.strokePath(); eG.fillStyle(0xff4757, 0.8); eG.fillCircle(25, 20, 6);
    eG.generateTexture('enemy_ship', 50, 50); eG.destroy();

    const lG = this.add.graphics();
    lG.fillStyle(0xffffff, 1); lG.fillRoundedRect(0, 0, 6, 24, 3);
    lG.generateTexture('laser', 6, 24); lG.destroy();

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
    const { items, loadout } = gsRef.current.campaignData;

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
      hp: aircraftBase.baseHp + armorHp, 
      maxHp: aircraftBase.baseHp + armorHp,
      mainAtk: mainGunBase ? (mainGunBase.baseAtk + (mainGunItem.level * 3) * mainGunItem.rarity) * mainAtkMult : 10, 
      wingAtk: wingmanBase ? (wingmanBase.baseAtk + (wingmanItem.level * 3) * wingmanItem.rarity) : 0,
      droneAtk: droneBase ? (droneBase.baseAtk + (droneItem.level * 3) * droneItem.rarity) : 0,
      
      mainFireRate: mainGunBase ? mainGunBase.fireRate * 1000 : 400,
      
      // 👇 BUFF TỐC ĐỘ BẮN SÚNG PHỤ LÊN GẤP 2-3 LẦN (Chỉ còn 600ms thay vì 1500ms)
      wingFireRate: 600 * wingRateMult, 
      
      // 👇 BUFF TỐC ĐỘ BẮN VỆ TINH LÊN MẠNH MẼ (Chỉ còn 800ms thay vì 2000ms)
      droneFireRate: 800, 
      
      mainGunId: mainGunBase ? mainGunBase.id : 'gun_laser',
      wingmanId: wingmanBase ? wingmanBase.id : null,
      droneId: droneBase ? droneBase.id : null,
      armorId: armorBase ? armorBase.id : null,
      pilotId: pilotBase.id
    };

    this.score = 0; this.isGameOver = false;
    this.nextEnemySpawn = 0; this.nextMainFire = 0; this.nextWingFire = 0; this.nextDroneFire = 0;

    const width = this.scale.width; const height = this.scale.height;

    this.bgGrid = this.add.grid(width/2, height/2, width, height * 2, 50, 50, 0x020c1b, 1, 0x00e5ff, 0.1);
    
    // 👇 TĂNG GIỚI HẠN ĐẠN LÊN 500 ĐỂ CHỐNG KẸT KHI BẮN QUÁ NHANH
    this.bullets = this.physics.add.group({ defaultKey: 'laser', maxSize: 500 });
    this.enemies = this.physics.add.group({ defaultKey: 'enemy_ship', maxSize: 50 });

    this.player = this.physics.add.sprite(width / 2, height - 100, 'player_ship_img');
    const targetWidth = Math.min(width * 0.25, 120); 
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
      this.leftDrone = this.add.sprite(this.player.x - 60, this.player.y + 20, 'drone_img');
      this.rightDrone = this.add.sprite(this.player.x + 60, this.player.y + 20, 'drone_img');
    }

    this.player.setInteractive(); this.input.setDraggable(this.player);
    this.input.on('drag', (pointer, obj, dragX, dragY) => {
        if (this.isGameOver) return;
        obj.x = dragX; obj.y = dragY - 40; 
    });

    const engineOffsetX = this.player.displayWidth * 0.22; const engineOffsetY = this.player.displayHeight * 0.40;
    const flareConf = { speed: 200, angle: 90, scale: { start: 0.6 * this.playerScale, end: 0 }, alpha: { start: 0.8, end: 0 }, blendMode: 'ADD', tint: 0x00e5ff, lifespan: 200 };
    this.engineFlareLeft = this.add.particles(0, 0, 'flare', flareConf).startFollow(this.player, -engineOffsetX, engineOffsetY);
    this.engineFlareRight = this.add.particles(0, 0, 'flare', flareConf).startFollow(this.player, engineOffsetX, engineOffsetY);

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, null, this);

    this.scoreText = this.add.text(20, 70, 'ĐIỂM TÁC CHIẾN: 0', { fontFamily: '"VT323", monospace', fontSize: '26px', color: '#00e5ff' }).setDepth(100);
    this.hpBarBg = this.add.graphics().setDepth(100); this.hpBar = this.add.graphics().setDepth(100);
    this.updateHpBar();
    this.scale.on('resize', this.handleResize, this);
  }

  handleResize(gameSize) {
    if (this.isGameOver) return;
    const w = gameSize.width; const h = gameSize.height;
    this.bgGrid.setPosition(w/2, h/2); this.bgGrid.setSize(w, h*2);
    this.physics.world.setBounds(0, 0, w, h);
    const targetWidth = Math.min(w * 0.25, 120); 
    const pWidth = this.player.width || 1;
    this.playerScale = targetWidth / pWidth;
    this.player.setScale(this.playerScale);
    const engineOffsetX = this.player.displayWidth * 0.22; const engineOffsetY = this.player.displayHeight * 0.40;
    this.engineFlareLeft.startFollow(this.player, -engineOffsetX, engineOffsetY);
    this.engineFlareRight.startFollow(this.player, engineOffsetX, engineOffsetY);
  }

  updateHpBar() {
    const ratio = Math.max(0, this.stats.hp / this.stats.maxHp);
    this.hpBarBg.clear(); this.hpBarBg.fillStyle(0x0a192f, 1); this.hpBarBg.fillRect(20, 100, 200, 12);
    this.hpBarBg.lineStyle(2, 0x00e5ff); this.hpBarBg.strokeRect(20, 100, 200, 12);
    this.hpBar.clear(); this.hpBar.fillStyle(ratio > 0.3 ? 0x2ecc71 : 0xff4757, 1);
    this.hpBar.fillRect(20, 100, 200 * ratio, 12);
  }

  spawnEnemy() {
    const enemy = this.enemies.get(Phaser.Math.Between(40, this.scale.width - 40), -50);
    if (!enemy) return; 
    enemy.setActive(true).setVisible(true); enemy.body.enable = true; enemy.body.setSize(30, 30);
    enemy.setVelocityY(Phaser.Math.Between(200, 350));
    enemy.hp = 50 + (this.score * 2); enemy.clearTint();
  }

  // 👇 HÀM SPAWN: CHỐNG TẠO LỖI VẬT LÝ KHI TÁI CHẾ ĐẠN
  spawnBullet(x, y, vx, vy, color, atk, bType = 'normal', target = null, texture = 'laser') {
    // Chỉ lấy Bullet ra mà không truyền x, y để tránh xung đột
    const b = this.bullets.get();
    if (!b) return;
    
    b.setTexture(texture); 
    if (texture === 'laser' || texture === 'plasma') {
       b.setTint(color);
       b.setScale(texture === 'plasma' ? 1.5 : 1);
    } else {
       b.clearTint(); 
       b.setScale(0.12); // Resize tên lửa cho thon gọn hơn
    }

    // 🔥 FIX LỖI TỌA ĐỘ VÀ VẬT LÝ TUYỆT ĐỐI BẰNG HÀM enableBody
    b.enableBody(true, x, y, true, true);
    b.body.updateFromGameObject();
    
    b.setVelocity(vx, vy);
    b.atk = atk; b.bType = bType; b.target = target;
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

  // 👇 SỬA LỖI TỌA ĐỘ WINGMAN (BẮN CHUẨN TỪ 2 BÊN CÁNH)
  fireWingman() {
    const activeEnemies = this.enemies.getChildren().filter(e => e.active);
    const target = activeEnemies.length > 0 ? activeEnemies[Math.floor(Math.random() * activeEnemies.length)] : null;
    
    // Tọa độ bắn chính xác từ 2 đầu cánh vuốt ngược của X-Wing
    const wingOffsetX = this.player.displayWidth * 0.40; 
    const wingOffsetY = this.player.displayHeight * 0.15; 
    
    if (this.stats.wingmanId) {
      const textureKey = this.textures.exists(this.stats.wingmanId) ? this.stats.wingmanId : 'laser';
      
      // Chú ý: Cộng thêm wingOffsetY vào this.player.y để Tên lửa lùi xuống phía dưới cánh
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
      if (enemy.active) {
        enemy.clearTint(); 
        if (enemy.setTintMode) enemy.setTintMode(Phaser.TintModes.MULTIPLY);
      }
    });

    if (bullet.bType !== 'plasma' && bullet.bType !== 'sniper') {
      bullet.setActive(false).setVisible(false); bullet.body.enable = false;
      if (bullet.texture.key.includes('rocket') || bullet.texture.key.includes('wing')) {
         this.explode(bullet.x, bullet.y, 0xffa502, 1.2); 
      }
    }

    if (enemy.hp <= 0) {
      this.explode(enemy.x, enemy.y, 0xff4757, 1.5);
      this.score += 10; this.scoreText.setText(`ĐIỂM TÁC CHIẾN: ${this.score}`);
      enemy.setActive(false).setVisible(false); enemy.body.enable = false;
    }
  }

  hitPlayer(player, enemy) {
    if (!enemy.active) return;
    enemy.setActive(false).setVisible(false); enemy.body.enable = false;
    this.explode(player.x, player.y, 0xFFD700, 2); this.cameras.main.shake(200, 0.015);
    this.stats.hp -= 200; this.updateHpBar();

    if (this.stats.hp <= 0) {
      this.isGameOver = true; this.physics.pause(); this.player.setVisible(false);
      this.engineFlareLeft.stop(); this.engineFlareRight.stop();
      if (this.shieldGlow) this.shieldGlow.setVisible(false);
      if (this.leftDrone) { this.leftDrone.setVisible(false); this.rightDrone.setVisible(false); }
      this.explode(this.player.x, this.player.y, 0xff0000, 4);
    }
  }

  update(time, delta) {
    if (this.isGameOver) return;

    this.bgGrid.y = (this.bgGrid.y + 2) % 50 + (this.scale.height / 2);

    if (this.leftDrone && this.rightDrone) {
      const hoverY = Math.sin(time * 0.005) * 10; 
      const droneOffsetX = this.player.displayWidth * 0.55;
      
      this.leftDrone.x = Phaser.Math.Linear(this.leftDrone.x, this.player.x - droneOffsetX, 0.2);
      this.leftDrone.y = Phaser.Math.Linear(this.leftDrone.y, this.player.y + 15 + hoverY, 0.2);
      
      this.rightDrone.x = Phaser.Math.Linear(this.rightDrone.x, this.player.x + droneOffsetX, 0.2);
      this.rightDrone.y = Phaser.Math.Linear(this.rightDrone.y, this.player.y + 15 + hoverY, 0.2);
    }
    
    if (this.shieldGlow) this.shieldGlow.setPosition(this.player.x, this.player.y);

    if (this.stats.pilotId === 'pilot_bear' && Math.random() < 0.016) {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.01);
      this.updateHpBar();
    }

    if (time > this.nextMainFire) { this.fireWeapons(); this.nextMainFire = time + this.stats.mainFireRate; }
    if (this.stats.wingmanId && time > this.nextWingFire) { this.fireWingman(); this.nextWingFire = time + this.stats.wingFireRate; }
    if (this.stats.droneId && time > this.nextDroneFire) { this.fireDrone(); this.nextDroneFire = time + this.stats.droneFireRate; }
    
    if (time > this.nextEnemySpawn) { this.spawnEnemy(); this.nextEnemySpawn = time + 1000 - Math.min(this.score * 2, 600); }

    const width = this.scale.width; const height = this.scale.height;

    this.bullets.getChildren().forEach(b => {
      if (!b.active) return;
      
      if (b.bType === 'homing' && b.target && b.target.active) {
        if (Phaser.Math.Distance.Between(b.x, b.y, b.target.x, b.target.y) < 40) {
           this.hitEnemy(b, b.target);
        } else {
           this.physics.moveToObject(b, b.target, 550);
           b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x) + Math.PI/2);
        }
      }
      
      if (b.y < -50 || b.y > height + 50 || b.x < -50 || b.x > width + 50) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });

    this.enemies.getChildren().forEach(e => {
      if (e.active && e.y > height + 50) { e.setActive(false).setVisible(false); e.body.enable = false; }
    });
  }
}