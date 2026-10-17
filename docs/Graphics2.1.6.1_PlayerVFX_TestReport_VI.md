# Báo cáo kiểm thử Graphics 2.1.6.1 Player VFX

## Baseline / phạm vi
- Baseline: FULL SOURCE Graphics 2.1.6 được bàn giao trước đây; bản 2.1.6 đã được người dùng xác nhận npm test **78 PASS**, Vite build PASS và startup bundle 830.4 KiB raw / 231.8 KiB gzip.
- Nội dung hotfix: visual projectile Babylon và engine exhaust hai chế độ. Không sửa `PlayerWeapons.js`, `combatStats.js`, `constants.js`, Firebase, server hoặc quyền truy cập dữ liệu.
- Hai scene bắn đã dùng chung `PlayerWeapons.js` và `ProjectileEmitter.js` từ baseline. Nguyên nhân khác biệt trực quan gồm hình học beam dài, thiếu tương phản trên nền Nereus, và `engineFx` nhân bản riêng từng scene.

## Kiểm thử ở môi trường tạo gói
- Node tests không yêu cầu Babylon WebGL: **81/81 PASS** (74 bài cũ + 7 bài VFX mới).
- Catalog: PASS 16 tàu, 8 phi công, 3 dungeon, 9 missions, 12 guns.
- Gameplay static: 14/14 PASS.
- Graphics static: 12/12 PASS.
- Security static: 14/14 PASS.
- Relative import audit: PASS.
- `node --check`: hai scene và các module VFX đều PASS.
- Kiểm tra ZIP CRC, SHA-256 diff, PATCH áp baseline tái tạo FULL SOURCE: chạy khi đóng gói.

## Kiểm tra bổ sung mới
1. Cả hai scene gọi chung emitter đạn và engine particle.
2. X-Wing dùng đúng offset riêng, không còn tọa độ Dungeon cố định.
3. Beam laser tân thủ có chiều dài <1.2 world unit về **visual** (không đổi damage/velocity).
4. Mọi gun có profile render hữu hạn + có viền tương phản.
5. Texture/material được cache, tự dispose khi scene bị hủy.
6. Flare engine là local asset, không phụ thuộc Internet.
7. Core/rim engine thống nhất vị trí, start/stop/dispose và thứ tự vẽ.

## Chưa xác nhận / giới hạn
- Chưa chạy trực tiếp Vite build sau hotfix hoặc render WebGL browser ở môi trường tạo gói vì không có npm dependencies; test Babylon NullEngine cũ cần chạy tại máy người dùng.
- Chưa đo FPS, memory GPU, dung lượng APK/IPA hoặc screenshots so sánh hai mode trên thiết bị thật.
- Cơ chế beam vẫn là chuỗi projectile ngắn, chưa phải continuous laser raycast; không thay đổi hành vi vì hotfix này chỉ sửa VFX.
- Cảnh nền Nereus vẫn sáng theo theme cũ. Viền tối dự kiến tăng độ tương phản nhưng cần người dùng xác nhận trực quan.
