# Space Fighter V4.4.4 — Portal Command Deck & Asset Reliability

## 1. Mục tiêu

V4.4.4 hợp nhất ba việc cùng ranh giới presentation/navigation:

1. Thiết kế lại Campaign Portal theo bố cục cầu chỉ huy: thanh hồ sơ/tài nguyên, chức năng phụ hai bên, phi cơ và phi công ở trung tâm, CTA Chiến dịch/Phó bản, dock quản lý 4 mục.
2. Giữ Tổng hành dinh ở đúng vai trò quản lý; chỉ HQ mở từ Stage Select hoặc Dungeon Select mới được phép Xuất kích.
3. Chấm dứt biểu tượng ảnh hỏng ở Pilot/HQ bằng chuỗi URL dự phòng và 8 portrait WebP cục bộ.

## 2. Portal mới

```text
Top bar: Profile · Energy/Coin/Gem
Side utilities: Quà tân thủ · Điểm danh · Sự kiện · Nhiệm vụ · Tải dữ liệu
Center: Phi cơ trực chiến · Phi công · Lực chiến · trạng thái hồ sơ
Combat CTA: Phó bản · Chiến dịch
Bottom dock: Tổng hành dinh · Kho trang bị · Phi công · Cửa hàng
```

PortalCommandDeckV444 chỉ đọc dữ liệu hiện có. CampaignPortal tiếp tục sở hữu authentication, profile modal, attendance, missions, events, resource manager và routing.

## 3. HQ và navigation

- `manage`: mở từ Portal; không có nút Xuất kích.
- `prebattle/campaign`: mở từ Stage Select; quay lại Stage Select; hiển thị đúng Ải.
- `prebattle/dungeon`: mở từ Dungeon Select; quay lại Dungeon Select; giữ QA zero-energy/no-reward/no-write.
- Profile cũ được bổ sung `currentPlanet` và `selectedStage` an toàn để tránh Stage Select trả về màn rỗng.

## 4. Asset reliability

`ReliableAssetImageV444` thử tuần tự các nguồn khác nhau. Khi toàn bộ nguồn lỗi, component hiển thị fallback do app kiểm soát thay vì biểu tượng ảnh hỏng của WebView.

Pilot candidates:

```text
catalog imgSrc
/images/pilots/<pilot_id>.webp
/images/pilots/<pilot_id>.png
/images/pilots/<short_id>.webp
/images/pilots/<short_id>.png
/images/hangar/pilots/<pilot_id>.webp
```

Tám WebP cuối cùng được bundle trong app nên Portal/HQ hoạt động khi offline. Các ảnh fallback là placeholder presentation, không đổi ID, passive, rarity hoặc progression.

## 5. Không nằm trong milestone

- Không bật GLB Meshy trong Campaign/Dungeon.
- Không thay AI, damage, reward, economy hoặc server authority.
- Không sửa Cloud Run/Dockerfile.
- Không tự tải model từ CDN trong gameplay.

## 6. Feature rollback

Đặt:

```text
VITE_SF_PORTAL_COMMAND_DECK_V444=false
```

để quay lại presentation HQ V4.4.2/V4.4.3 trong khi giữ source mới trong codebase.

## 7. APK QA

- Portal không chồng CTA/dock trên Redmi Turbo 4 Pro.
- Dock có 4 label rõ ràng.
- Hero tàu/Pilot luôn có hình hoặc fallback, không có biểu tượng ảnh hỏng.
- HQ từ Portal không có Xuất kích.
- HQ từ Campaign/Dungeon có đúng context và đường quay lại.
- Rút lui/chiến thắng Campaign không còn trả về màn đen.
- Offline Portal/HQ vẫn hiển thị WebP cục bộ.
