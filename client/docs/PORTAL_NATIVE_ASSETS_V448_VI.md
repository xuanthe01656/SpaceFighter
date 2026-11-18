# Space Fighter V4.4.8 — Portal Native Icon Asset Pass

Baseline bắt buộc: **V4.4.7 Aurora Tactical + V4.4.6 structural layout** đã hợp nhất vào `main`; V447 GateFix R1 đã sửa regression kiểm kê nút cũ V442 nếu vẫn cần. Không áp lên V4.4.6 hoặc CSS đã chỉnh ngoài gói.

## Thay đổi

1. **Gỡ viền thừa ở Portal**: nút Chiến dịch/Phó bản hiện chỉ sử dụng một khung Neo WebP gốc, không thêm `border`, `border-radius`, lớp màu và bóng viền CSS lên trên. Icon bên trong không có hộp vuông.
2. **Tiện ích và dock**: vẫn giữ đúng 5 tiện ích (bao gồm Tải dữ liệu), 4 điểm đến duy nhất ở dock; đổi style sang tấm kim loại góc cắt không viền. Vẽ hình cắt góc trên pseudo-layer bên dưới để huy hiệu thông báo đỏ vẫn hiện bên ngoài nút. Không thêm nút, không thay logic/route.
3. **Chín icon thực sự khớp chức năng**: Nạp đầu (`misc_reward`), Điểm danh (`misc_calendar`), Sự kiện (`nav_event`), Nhiệm vụ (`misc_task`), Tổng hành dinh (`bld_command`), Kho trang bị (`bld_storage`), Phi công (`ui_friends`), Phó bản (`combat_attack`), Chiến dịch (`nav_mission`). Gắn vào đúng button handler qua `data-sf-icon-v448` (không dùng `nth-child` để xác định ý nghĩa).
4. **Cửa hàng và Tải dữ liệu**: dùng nguyên icon nội bộ vì `icons.zip` không có icon giỏ hàng/tải xuống tương đương. Profile/currency giữ chính xác ý nghĩa nguồn dữ liệu.
5. **HQ**: chỉ bỏ viền CSS thừa trên hai CTA có hình nền WebP; giữ nguyên khung phòng trang bị, radar, pilot và bố cục đã chốt.

## Kỹ thuật

- 9 ảnh từ `icons.zip`, được crop theo alpha và giảm xuống 192×192 WebP có alpha; tổng ~145.7 KB, lưu `client/public/assets/ui/spacefighter-portal-icons-v448` trong APK. Không sử dụng CDN/GLB.
- Dùng `import.meta.env.BASE_URL` để dựng URL icon, hỗ trợ đường dẫn Vite và offline. Có fallback icon SVG cũ khi ảnh không tải được; không tạo icon trống.
- Chỉ sửa UI JSX + CSS và package/test/docs. Không đổi Game API, Firebase, economy, skills, combat, Catalog, model GLB hoặc thứ tự điều hướng.
- `V448_SAFE_APPLY.mjs` kiểm tra hash gói, source CSS V447 trước khi sửa, khác biệt phạm vi và chạy test/build. Lỗi thì khôi phục các file trong scope. Không tự commit/push.

## Kiểm thử bổ sung

`node --test tests/portalAssetNativeIconsV448.test.mjs`: đối chiếu các route, 9 ảnh WebP, tính nguyên vẹn kích thước, không có viền CTA, fallback SVG, HQ cards và 4 dock links. Sau đó `npm test` và `npm run build:mobile` là điều kiện để finalize.

Cần QA thủ công trên **Redmi Turbo 4 Pro**: các hình 3D phải rõ trong nhãn và không che chữ, 2 CTA không còn viền vuông, icon không biến mất ở chế độ offline, tap đúng route, portrait/landscape và màn hình có tai thỏ vẫn cân đối. Không tuyên bố thiết bị PASS trước khi test APK thật.

**Pháp lý**: Các file PNG/SVG đầu vào được người dùng cung cấp. Chưa có giấy phép/nguồn gốc riêng của `icons.zip` trong gói nên chưa đủ cơ sở xác nhận quyền phân phối thương mại; khi phát hành cần xác minh giấy phép/tác quyền của bộ icon, không suy ra từ giấy phép của các asset khác.
