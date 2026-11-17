# Space Fighter V4.4.2 — Command Hangar

## Mục tiêu

V4.4.2 bổ sung lối vào **Tổng hành dinh** rõ ràng tại Campaign Portal và chuyển HQ sang bố cục Command Hangar:

- phi cơ là tâm điểm;
- trang bị bố trí quanh phi cơ;
- tab Trang bị / Kỹ năng / Diện mạo;
- phi công và danh sách phi cơ sở hữu có khu vực riêng;
- chỉ số chiến đấu và hành động xuất kích giữ nguyên dữ liệu hiện có;
- không đưa authority, economy hoặc inventory mutation vào component trình bày mới.

## Phạm vi hành vi được giữ nguyên

`HQ/index.jsx` tiếp tục sở hữu:

- `battle.start` / `battle.abandon`;
- energy và guest save;
- Firebase inventory equip;
- xác nhận loadout;
- lazy battle preload;
- Campaign, Dungeon và QA launch contract.

`CommandHangarV442.jsx` chỉ nhận dữ liệu và callback.

## Chính sách asset

### Nằm sẵn trong APK/IPA

- 16 WebP preview phi cơ;
- 18 WebP preview vũ khí;
- 33 asset HUD V3 cần trực tiếp cho Command Hangar.

Tổng payload cục bộ được giới hạn dưới 3 MiB. HQ luôn mở được khi ngoại tuyến.

### Không đóng gói trong V4.4.2

- 16 GLB phi cơ;
- 18 GLB vũ khí.

Các GLB được định nghĩa là **gói CDN tùy chọn**. Runtime chỉ được dùng model sau khi resource-delivery tải, xác minh SHA-256, lưu vào vùng app-private và kích hoạt nguyên tử. Nếu model thiếu hoặc lỗi, UI dùng WebP cục bộ.

## Quy tắc sản phẩm

- Không tải GLB trực tiếp từ CDN trong combat loop.
- Không tải toàn bộ 34 GLB cùng lúc.
- Một Hangar chỉ giữ tối đa một model phi cơ và model trang bị đang xem.
- Model không quyết định hitbox, damage, stats hoặc reward.
- Mobile mặc định dùng WebP cho tới khi model có device benchmark đạt.

## QA APK

Build bằng workflow Android Unified QA. Kiểm tra:

- nút Tổng hành dinh xuất hiện và quay lại đúng Campaign Portal;
- đổi tàu, đổi trang bị, đổi phi công;
- portrait phone, notch, tablet và landscape;
- WebP fallback khi tắt mạng;
- không có GLB trong APK scope V4.4.2;
- Campaign/Dungeon launch và authority không hồi quy.
