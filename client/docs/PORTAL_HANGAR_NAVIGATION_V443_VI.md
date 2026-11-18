# Space Fighter V4.4.3 — Portal Dock, Command Hangar Context và Campaign Return Safety

## Mục tiêu

V4.4.3 gộp những sửa đổi có cùng ranh giới sản phẩm và có thể nghiệm thu trong một APK:

1. Portal giữ **Phó bản** và **Chiến dịch** là hai hành động chiến đấu.
2. Tổng hành dinh, Kho trang bị, Phi công và Cửa hàng nằm trong một dock quản lý bốn mục.
3. Tổng hành dinh mở từ Portal là chế độ **quản lý**, không có nút Xuất kích.
4. Tổng hành dinh mở từ Stage Select hoặc Dungeon Select là chế độ **chuẩn bị trước trận**, có nút Xuất kích đúng nội dung.
5. Slot quanh phi cơ chỉ hiển thị hình/glyph; không dùng rank frame và không lặp lại tên trang bị quanh tàu.
6. Profile cũ được chuẩn hóa `currentPlanet` và `selectedStage` để Stage Select không trả về màn hình rỗng sau khi rời Campaign.
7. V4.4.2 vẫn được giữ làm fallback khi tắt cờ V4.4.3.

## Cờ rollback

```env
VITE_SF_PORTAL_HANGAR_V443=false
```

Khi tắt cờ này, HQ quay về `CommandHangarV442`. Portal dock và profile normalization vẫn còn vì đây là sửa navigation/safety, không phải thử nghiệm presentation.

## Không nằm trong milestone

- Không bật GLB mới trong Campaign/Dungeon.
- Không tải GLB từ CDN.
- Không sửa AI, Boss, damage, reward hoặc economy.
- Không xử lý Dungeon intermittent runtime stall; issue đó cần instrumentation riêng.
- Không sửa Cloud Run hoặc server authority.

## Luồng đúng

```text
Campaign Portal -> Tổng hành dinh
  mode=manage
  back=campaign_portal
  launch=hidden

Stage Select -> HQ
  mode=prebattle
  back=stage_select
  launch=campaign stage

Dungeon Select -> HQ
  mode=prebattle
  back=dungeon_select
  launch=dungeon
```

## APK QA

- Portal: hai CTA chiến đấu không bị đẩy; dock quản lý đủ bốn mục.
- HQ manage: không có Xuất kích, slot chỉ có hình/glyph, back về Portal.
- HQ prebattle Campaign: Xuất kích đúng ải, rút lui/victory về Stage Select, không màn hình đen.
- HQ prebattle Dungeon: Xuất kích đúng Dungeon, back về Dungeon Select.
- Portrait/landscape/tablet/notch; background/resume; không crash/ANR.
