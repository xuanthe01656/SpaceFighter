# Space Fighter 2.1.5 — Product Combat Configuration v1

## 1. Phạm vi

Cơ sở là Graphics 2.1.4 Combat/Input, nhưng bản PATCH CUMULATIVE có thể áp dụng trực tiếp trên Graphics 2.1.3 mà người dùng đang chạy (bao gồm toàn bộ thay đổi 2.1.4). Mục tiêu: một nguồn cấu hình, một hàm tính stats, không sửa ID Firebase và không thêm debuff ngầm.

**ĐÂY CHƯA PHẢI BẢN PHÁT HÀNH THƯƠNG MẠI.** Các bài test WebGL, hiệu năng trên thiết bị thật, receipt/IAP và xác minh kết quả chiến đấu trên server là các release gate còn mở.

## 2. Cây thư mục

```
client/src/constants.js                         // facade: giữ nguyên API import từ code cũ
client/src/game/catalog/
  aircraft.js   pilots.js   gear.js              // catalog ID ổn định; không ghi vào profile
  worlds.js     missions.js events.js
  economy.js    progression.js profileDefaults.js uiLegacy.js
client/src/game/config/
  BattleRules.js                                  // version + phép tính modifier thuần
  DungeonDifficulty.js                            // DIFF cấu hình quái, không phải debuff
  PerformanceProfiles.js                          // chỉ điều khiển chất lượng đồ họa
client/src/game/combat/
  ActiveEffects.js                                // buff tạm thời, không ghi Firestore
  BattlePassives.js                               // giáp/phi công có cooldown
  ShipInputController.js PlayerWeapons.js ProjectileEmitter.js
client/src/utils/combatStats.js                  // base loadout + effective loadout
client/scripts/check-product-catalog.mjs        // validate ID, đơn vị, ràng buộc
client/scripts/prepare-mobile-bundle.mjs        // bỏ 2 GLB tùy chọn khỏi dist native
```

**Giữ nguyên `DEFAULT_CAMPAIGN_DATA`, khóa profile, UID, loadout, ID pilot/aircraft/gear, loại tiền, mission ID, dữ liệu Firebase và rules**. Không cần migration dữ liệu profile để sử dụng mô-đun cấu hình mới.

## 3. Cách tính chỉ số

1. `deriveCombatLoadout(profile,catalogs)`: thuần, lấy base stats từ tàu, phi công, vật phẩm. FireRate súng chính có đơn vị giây; Wingman và Drone có đơn vị mili giây (được chuyển sang ms một cách tường minh, không đoán theo giá trị).
2. `getBattleEnvironment(mode, location)`: lấy hiệu ứng chiến đấu được công bố từ `worlds.js`.
3. `applyBattleModifiers(baseStats, modifiers, nowMs)`: `(base + tổng flat) × tích multiplier`, giới hạn theo stat, không làm biến đổi đối tượng base.
4. `deriveBattleLoadout(...)`: sử dụng chung cho Campaign và Dungeon. HQ hiển thị sức mạnh gốc, không cộng debuff tạm của nơi chiến đấu. CP giữ đúng công thức gốc.
5. `ActiveEffects` xử lý buff tạm, tự loại khi hết hạn, không cộng trừ kiểu `setTimeout` dẫn đến sai số.

`BALANCE_VERSION = combat-v1.0.0`; các thay đổi về kinh tế/cân bằng cần có kiểm thử và version riêng trong tương lai. Không dùng một catalog client để làm bằng chứng đủ điều kiện thưởng Cloud; backend vẫn quyết định tiến trình và tài nguyên.

### Quy tắc môi trường đã chốt

| Vùng | Tác động player | Tác động enemy |
|---|---|---|
| Alpha | Không | HP ×1 |
| Cryo-7 | Speed ×0.8 | HP ×1.5 |
| Inferno | Không | HP ×2 |
| Taurus/Nereus/Abaddon | Không | `DungeonDifficulty.js` quyết định HP, nhịp spawn, đạn và Boss |

Các field cũ `speedDebuff` và `enemyHpBuff` **vẫn được giữ** cho UI/hồ sơ cũ; bộ kiểm tra bắt buộc chúng trùng các giá trị mới để không drift. Các modifier có `id,stat,op,value` và tùy chọn `stackGroup,maxStacks,durationMs,appliedAtMs`. Chỉ cho phép stat trong `STAT_BOUNDS` để tránh effect tùy ý đánh vào progress/tiền/UID. Nếu `maxStacks` khác nhau giữa các phần tử một nhóm, thứ tự thêm quyết định bản nào được giữ (đối với nhiều nguồn buff về sau cần khai báo ưu tiên rõ).

### Tốc độ di chuyển

`movement factor = effectiveSpeed / 6` (giới hạn 0.15–3). X-Wing gốc `speed=6` giữ nguyên; tàu có speed khác 6 chạy nhanh/chậm tương ứng. Trên Cryo, nhân thêm 0.8 vào effectiveSpeed. Hiệu ứng này ảnh hưởng cả chuột kéo, touch và bàn phím như nhau; không đụng hitbox hoặc hướng bắn.

## 4. Nội tại (giá trị cân bằng ban đầu, cần UAT)

- Shield Armor: khiên hấp thụ bằng 20% maxHP mỗi trận, không tự hồi.
- Reactive Plating: phản 15% sát thương hit tới quái gần khi trúng **projectile**.
- Nano Armor: tăng hồi HP theo thời gian 0,6% maxHP/giây.
- Void Barrier: tăng `damageReduction` thêm 15 điểm % với giới hạn 90% tổng.
- Crystal Armor: phản 20% sát thương hit tới quái gần.
- Nova Pilot: hiệu ứng nổ gây 800 sát thương tới quái gần khi nhận hit hợp lệ, cooldown 15 giây.
- Echo Pilot: nhân bản 1 viên đạn chính mỗi 8 giây, không nhân bản toàn bộ chùm đạn.
- Drone Guardian và Repair tiếp tục giữ hành vi của bản 2.1.4. Các passives này tác động combat-local, không sửa profile hoặc thưởng server.

**Giới hạn:** Thorns/Nova hiện tác động quái thường trong bán kính gần, chưa xử lý tác động riêng lên Boss. Shield chưa có UI thanh khiên độc lập. Các kỹ năng chủ động/cấp sao, hệ thống kháng hiệu ứng, VFX cao cấp và chống gian lận server combat chưa được hoàn thành. Giá trị phần trăm này là baseline đề xuất, không phải đã cân bằng bằng telemetry.

## 5. Desktop, Android, iOS: cấu hình render

`PerformanceProfiles.js` tách hoàn toàn khỏi combat stats:

| Preset | DPR tối đa | Sao nền | Particle | FPS mục tiêu | GLB auto tối đa |
|---|---:|---:|---:|---:|---:|
| Desktop | 1.5 | 100% | 100% | 60 | 8 MiB |
| Mobile | 1.25 | 65% | 65% | 60 | 3 MiB |
| Mobile Low | 1.0 | 40% | 40% | 30 | 1 MiB |

Các preset dùng heuristic User-Agent/deviceMemory/hardwareConcurrency, **không đồng nghĩa đã đo được FPS thực**. Controller Babylon giảm/tăng độ phân giải sau nhiều cửa sổ 2,5 giây, chống bật tắt liên tục, không sửa `engine.getDeltaTime()`, cooldown hay công thức combat. `preserveDrawingBuffer=false` tiết kiệm chi phí giữ framebuffer; chụp canvas riêng phải xử lý theo luồng screenshot nếu có trong tương lai.

Hai mô hình tùy chọn X-Wing và Swarm Cannon hiện mỗi file khoảng 58–60 MB, không phù hợp nạp tự động. `npm run build:mobile` sẽ sau khi Vite build tự loại hai file đó khỏi `dist` vì runtime native dùng sprite/fallback; **source gốc và web build vẫn giữ model**. Không chạy `npx cap sync` sau `npm run build` thuần nếu muốn bản mobile gọn.

### Lệnh CMD Windows

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm test
npm run check:catalog
npm run check:gameplay
npm run check:graphics21
npm run build
npm run dev
```

Build native:

```bat
npm run build:mobile
npx cap sync android
npx cap open android
```

Với iOS, trên macOS có Xcode/cert và provisioning:

```bash
npm run build:mobile
npx cap sync ios
npx cap open ios
```

### UAT bắt buộc

- Chuột giữ/kéo, touch và WASD tại Campaign và Dungeon; đi bốn hướng; rời canvas rồi thả chuột không kẹt.
- 16 loại tàu: X-Wing speed 6 và tàu nhanh/chậm, Cryo speed -20%; cùng trang bị bắn giống nhau ở hai chế độ.
- Shield/regen/void/reactive/crystal/Nova/Echo, đồng hồ và hiệu ứng khi trúng đạn; không đụng tài nguyên Cloud.
- 5/10/20 phút chạy trên mobile phổ thông, chip nóng, mất focus, thay đổi orientation, cảnh báo memory và GPU frame time. Đo trên thiết bị thật, không suy diễn từ bài test Node.
- Thanh toán: **đang khóa**; phải xác thực hóa đơn ở backend theo Apple/Google trước khi mở mua hàng thật.
- Kết quả `battle.finish` trên server hiện chưa chứng minh được client đã thực sự thắng: yêu cầu anti-cheat/rule simulation và replay/audit trước thương mại.

## 6. Cách thêm một hành tinh mới

1. Thêm `id` ổn định, `name`, `imgSrc` trong `catalog/worlds.js`, danh sách `PLANET_ENEMIES`, `PLANET_BOSSES`, `PLANET_STAGE_NAMES` và các stage tương ứng.
2. Đưa modifier **có mô tả hiển thị** vào `battle.playerModifiers`; nếu không có debuff để `[]`. Ví dụ minh họa: `{id:'ion_debuff', stat:'fireRate', op:'multiply', value:1.15}` = tăng chu kỳ bắn 15% (bắn chậm hơn). Không áp dụng thử nghiệm này vào ba hành tinh hiện tại.
3. Thiết kế `reward/cost` và giới hạn ở server riêng, không tự lưu stat môi trường vào profile.
4. Chạy `npm run check:catalog`, `npm test` và UAT thực tế. Không thay đổi ID sản phẩm/currency đã bán mà không có kế hoạch migration tương thích.

## 7. Giới hạn và release gates

Trạng thái bản 2.1.5: kiến trúc/data + cơ chế gameplay đã được triển khai và qua kiểm thử logic; **chưa có đo FPS/thermal trên thiết bị, chưa có runtime Babylon WebGL/Capacitor trong môi trường kiểm tra, chưa có store release validation**. Các mốc production bắt buộc: kiểm tra chi phí GPU, asset LOD thực, build/signing Play/App Store, xác minh receipt server, kết quả trận server-authoritative, monitoring/crash/analytics, quyền riêng tư và test nhiều loại thiết bị.
