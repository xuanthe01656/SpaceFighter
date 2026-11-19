# Space Fighter V4.4.11 — Portal Header & Ship Preview (Web QA)

**Trạng thái:** source-only review; chưa commit/push, chưa tạo APK, chưa đổi gameplay.

## Phạm vi giao diện

### Portal — header hai tầng
- Hàng trên: avatar, tên phi công, cấp, thanh XP; bên phải thể hiện trạng thái KHÁCH/TÀI KHOẢN từ `currentUser`. Bấm cả thanh vẫn mở modal hồ sơ đã có.
- Hàng dưới: đúng **5 nguồn dữ liệu hiện hữu**: energy, coins, diamonds, materials.blueprints và materials.gears. Không tạo hoặc thay đổi currency.
- Năm chip cùng một hàng; icon + số lớn và nhãn nhỏ. Trên màn hình hẹp, chữ rút gọn được ghi rõ trong title/tooltip; không xuống hàng 3+2 nữa.
- Không tạo nút Mail/Settings chưa có callback như hình tham chiếu.
- Giữ toàn bộ background, 5 tiện ích, CTA Campaign/Dungeon, dock 4 nút và route.

### HQ — ship thumbnail không cắt
- `ship_xwing.webp` 640×640 có đủ mũi, cánh và đuôi. Lỗi trong selector/card đến từ vùng preview cố định chiều cao kết hợp ảnh bị co/giãn theo layout.
- `selectorPreview`/`fleetPreview`/`appearancePreview` chuyển sang vùng vuông (`aspect-ratio: 1 / 1`); ảnh `position:absolute`, nằm trong vùng 90% bằng `object-fit:contain` và `object-position:center`.
- Card chọn tàu có thể dài hơn, danh sách vẫn cuộn, Fleet vẫn cuộn ngang, không thay đổi dữ liệu `ownedAircrafts` hoặc `resolveCommandHangarShipPreviewV442`.
- Không sửa vị trí sáu slot hoặc tính lực chiến, Pilot, skin, tab và nút điều hướng/launch.

## Giới hạn
- Đã đối chiếu source từ gói V4.4.10 và artifact history, không phải checkout trực tiếp của máy người dùng. Installer từ chối nếu baseline khác; không ép ghi đè.
- Smoke test và fixture không thay cho đánh giá bằng ứng dụng web chạy trên môi trường người dùng.
- Sau khi Web QA PASS mới nên chạy full test và xin quyết định commit/push. Tuyệt đối chưa chạy GitHub Actions APK trong bước này.
