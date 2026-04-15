import * as Phaser from 'phaser';

export default class CampaignScene extends Phaser.Scene {
  constructor() {
    super('CampaignScene');
  }

  // ==========================================
  // 1. VẼ ĐỒ HỌA VECTOR CHUẨN AAA MECHA
  // ==========================================
  preload() {
    // 1. Tàu người chơi (Fighter Jet góc cạnh)
    const pG = this.add.graphics();
    pG.fillStyle(0x0a192f, 1);
    pG.lineStyle(2, 0x00e5ff, 1);
    pG.beginPath();
    pG.moveTo(30, 0); pG.lineTo(60, 40); pG.lineTo(50, 50); pG.lineTo(30, 40); pG.lineTo(10, 50); pG.lineTo(0, 40); pG.closePath();
    pG.fillPath(); pG.strokePath();
    // Kính buồng lái (Cockpit)
    pG.fillStyle(0xffffff, 0.8); pG.fillEllipse(30, 20, 8, 15);
    pG.generateTexture('player_ship', 60, 60);
    pG.destroy();

    // 2. Tàu Địch (Alien Drone hình lục giác)
    const eG = this.add.graphics();
    eG.fillStyle(0x1a0510, 1);
    eG.lineStyle(2, 0xff4757, 1);
    eG.beginPath();
    eG.moveTo(25, 50); eG.lineTo(50, 20); eG.lineTo(40, 0); eG.lineTo(10, 0); eG.lineTo(0, 20); eG.closePath();
    eG.fillPath(); eG.strokePath();
    // Lõi năng lượng quái
    eG.fillStyle(0xff4757, 0.8); eG.fillCircle(25, 20, 6);
    eG.generateTexture('enemy_ship', 50, 50);
    eG.destroy();

    // 3. Đạn Laser (Capsule sắc nét)
    const lG = this.add.graphics();
    lG.fillStyle(0xffffff, 1);
    lG.fillRoundedRect(0, 0, 6, 24, 3);
    lG.generateTexture('laser', 6, 24);
    lG.destroy();

    // 4. Hạt sáng (Flare)
    const fG = this.add.graphics();
    fG.fillStyle(0xffffff, 1); fG.fillCircle(8, 8, 8);
    fG.generateTexture('flare', 16, 16);
    fG.destroy();
  }

  // ==========================================
  // 2. THIẾT LẬP CHIẾN TRƯỜNG & HỒ CHỨA (POOLING)
  // ==========================================
  create() {
    const gsRef = this.registry.get('gsRef');
    const { items, loadout } = gsRef.current.campaignData;

    // Đọc thông số vũ khí an toàn (Tránh NaN)
    this.stats = {
      hp: gsRef.current.campaignData.progress.combatPower || 1000,
      maxHp: gsRef.current.campaignData.progress.combatPower || 1000,
      mainAtk: 50, wingAtk: 20,
      mainFireRate: 300, wingFireRate: 1500,
      mainGunId: items[loadout.mainGun]?.baseId || 'gun_laser',
      wingmanId: items[loadout.wingman]?.baseId || null
    };

    this.score = 0; 
    this.isGameOver = false;
    this.nextEnemySpawn = 0;
    this.nextMainFire = 0;
    this.nextWingFire = 0;

    const width = this.scale.width;
    const height = this.scale.height;

    // --- NỀN LƯỚI KHÔNG GIAN SCROLLING (Chuẩn Sci-fi) ---
    this.bgGrid = this.add.grid(width/2, height/2, width, height * 2, 50, 50, 0x020c1b, 1, 0x00e5ff, 0.1);
    
    // --- OBJECT POOLING (KỸ THUẬT CỐT LÕI CỦA GAME AAA) ---
    // Khởi tạo sẵn 200 viên đạn và 50 quái vật, tái sử dụng liên tục để chống Lag
    this.bullets = this.physics.add.group({ defaultKey: 'laser', maxSize: 200 });
    this.enemies = this.physics.add.group({ defaultKey: 'enemy_ship', maxSize: 50 });

    // --- PHI CƠ CHÍNH ---
    this.player = this.physics.add.sprite(width / 2, height - 100, 'player_ship');
    this.player.body.setSize(20, 30);
    this.player.setCollideWorldBounds(true);
    
    // Điều khiển bằng ngón tay
    this.player.setInteractive();
    this.input.setDraggable(this.player);
    this.input.on('drag', (pointer, obj, dragX, dragY) => {
        if (this.isGameOver) return;
        obj.x = dragX; obj.y = dragY - 40; 
    });

    // Tia lửa đuôi tàu (Gắn dính vào tàu)
    this.engineFlare = this.add.particles(0, 0, 'flare', {
      speed: 150, angle: 90, scale: { start: 0.5, end: 0 },
      blendMode: 'ADD', tint: 0x00e5ff, lifespan: 200
    });
    this.engineFlare.startFollow(this.player, 0, 25);

    // --- XỬ LÝ VA CHẠM ---
    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, null, this);

    // --- HUD (Giao diện) ---
    this.scoreText = this.add.text(20, 70, 'ĐIỂM TÁC CHIẾN: 0', { fontFamily: '"VT323", monospace', fontSize: '26px', color: '#00e5ff' }).setDepth(100);
    this.hpBarBg = this.add.graphics().setDepth(100);
    this.hpBar = this.add.graphics().setDepth(100);
    this.updateHpBar();
  }

  updateHpBar() {
    const ratio = Math.max(0, this.stats.hp / this.stats.maxHp);
    this.hpBarBg.clear(); this.hpBarBg.fillStyle(0x0a192f, 1); this.hpBarBg.fillRect(20, 100, 200, 12);
    this.hpBarBg.lineStyle(2, 0x00e5ff); this.hpBarBg.strokeRect(20, 100, 200, 12);
    this.hpBar.clear(); this.hpBar.fillStyle(ratio > 0.3 ? 0x2ecc71 : 0xff4757, 1);
    this.hpBar.fillRect(20, 100, 200 * ratio, 12);
  }

  // ==========================================
  // 3. CÁC HÀM SPAWN TỪ HỒ CHỨA (POOLING)
  // ==========================================
  spawnEnemy() {
    // Lấy 1 con quái từ kho chứa ra dùng
    const enemy = this.enemies.get(Phaser.Math.Between(40, this.scale.width - 40), -50);
    if (!enemy) return; // Nếu kho hết thì bỏ qua, chống lag

    enemy.setActive(true).setVisible(true);
    enemy.body.enable = true;
    enemy.body.setSize(30, 30);
    enemy.setVelocityY(Phaser.Math.Between(200, 350));
    enemy.hp = 50 + (this.score * 2);
    enemy.clearTint();
  }

  spawnBullet(x, y, vx, vy, color, bType = 'normal', target = null) {
    const b = this.bullets.get(x, y);
    if (!b) return;

    b.setActive(true).setVisible(true);
    b.body.enable = true;
    b.setTint(color);
    b.setVelocity(vx, vy);
    b.atk = this.stats.mainAtk;
    b.bType = bType;
    b.target = target;
    b.setRotation(Math.atan2(vy, vx) + Math.PI/2);
  }

  fireWeapons() {
    const x = this.player.x; const y = this.player.y - 30;
    
    // Súng chính: Bắn Tỏa 3 tia
    if (this.stats.mainGunId === 'gun_spread') {
      this.spawnBullet(x, y, 0, -1000, 0x00e5ff);
      this.spawnBullet(x - 15, y + 10, -300, -900, 0x00e5ff);
      this.spawnBullet(x + 15, y + 10, 300, -900, 0x00e5ff);
    } else {
      // Súng thường 1 tia
      this.spawnBullet(x, y, 0, -1200, 0xff4757);
    }
  }

  fireWingman() {
    const x = this.player.x; const y = this.player.y;
    
    // Tên lửa đuổi (Homing Missile)
    if (this.stats.wingmanId === 'wing_missile') {
      // Tìm 1 con quái đang sống ngẫu nhiên trên sân
      const activeEnemies = this.enemies.getChildren().filter(e => e.active);
      const target = activeEnemies.length > 0 ? activeEnemies[Math.floor(Math.random() * activeEnemies.length)] : null;
      
      this.spawnBullet(x - 30, y, 0, -400, 0xf1c40f, 'homing', target);
      this.spawnBullet(x + 30, y, 0, -400, 0xf1c40f, 'homing', target);
    }
  }

  // ==========================================
  // 4. HIỆU ỨNG VÀ VA CHẠM
  // ==========================================
  showDamage(x, y, dmg) {
    const txt = this.add.text(x, y, `-${dmg}`, { fontFamily: '"VT323", monospace', fontSize: '24px', color: '#FFD700' }).setOrigin(0.5);
    this.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 500, onComplete: () => txt.destroy() });
  }

  explode(x, y, color, scale = 1) {
    const emitter = this.add.particles(x, y, 'flare', {
      speed: { min: 100, max: 400 }, angle: { min: 0, max: 360 },
      scale: { start: 0.5 * scale, end: 0 }, blendMode: 'ADD', tint: color,
      lifespan: 300, quantity: 15
    });
    emitter.explode();
  }

  hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    
    // Thu hồi đạn vào kho
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;

    enemy.hp -= bullet.atk;
    this.showDamage(enemy.x, enemy.y, bullet.atk);
    
    // Hiệu ứng nhấp nháy trắng khi trúng đạn (Hit flash)
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(50, () => { if (enemy.active) enemy.clearTint(); });

    if (enemy.hp <= 0) {
      this.explode(enemy.x, enemy.y, 0xff4757, 1.5);
      this.score += 10;
      this.scoreText.setText(`ĐIỂM TÁC CHIẾN: ${this.score}`);
      // Thu hồi quái vào kho
      enemy.setActive(false).setVisible(false);
      enemy.body.enable = false;
    }
  }

  hitPlayer(player, enemy) {
    if (!enemy.active) return;
    enemy.setActive(false).setVisible(false); enemy.body.enable = false;
    
    this.explode(player.x, player.y, 0xFFD700, 2);
    this.cameras.main.shake(200, 0.015);

    this.stats.hp -= 200;
    this.updateHpBar();

    if (this.stats.hp <= 0) {
      this.isGameOver = true;
      this.physics.pause();
      this.player.setVisible(false);
      this.engineFlare.stop();
      this.explode(this.player.x, this.player.y, 0xff0000, 4);
    }
  }

  // ==========================================
  // 5. VÒNG LẶP UPDATE (60 FPS)
  // ==========================================
  update(time, delta) {
    if (this.isGameOver) return;

    // Cuộn lưới nền tạo cảm giác tốc độ ánh sáng
    this.bgGrid.y = (this.bgGrid.y + 2) % 50 + (this.scale.height / 2);

    // Kích hoạt Súng chính
    if (time > this.nextMainFire) {
      this.fireWeapons();
      this.nextMainFire = time + this.stats.mainFireRate;
    }

    // Kích hoạt Súng phụ
    if (this.stats.wingmanId && time > this.nextWingFire) {
      this.fireWingman();
      this.nextWingFire = time + this.stats.wingFireRate;
    }

    // Sinh Quái
    if (time > this.nextEnemySpawn) {
      this.spawnEnemy();
      this.nextEnemySpawn = time + 1000 - Math.min(this.score * 2, 600); // Quái ra nhanh dần
    }

    // --- DỌN DẸP VÀ CẬP NHẬT RIÊNG CHO POOLING ---
    const width = this.scale.width;
    const height = this.scale.height;

    this.bullets.getChildren().forEach(b => {
      if (!b.active) return;

      // Xử lý Tên Lửa Đuổi (Homing Missile)
      if (b.bType === 'homing' && b.target && b.target.active) {
        this.physics.moveToObject(b, b.target, 600);
        b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x) + Math.PI/2);
      }

      // Thu hồi đạn bay ra khỏi màn hình
      if (b.y < -50 || b.y > height + 50 || b.x < -50 || b.x > width + 50) {
        b.setActive(false).setVisible(false);
        b.body.enable = false;
      }
    });

    // Thu hồi quái lọt lưới
    this.enemies.getChildren().forEach(e => {
      if (e.active && e.y > height + 50) {
        e.setActive(false).setVisible(false);
        e.body.enable = false;
      }
    });
  }
}