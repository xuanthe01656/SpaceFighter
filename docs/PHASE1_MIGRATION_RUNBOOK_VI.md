# PHASE 1 — RUNBOOK CHUYỂN ĐỔI VÀ ROLLBACK

## 1. Trước khi triển khai

- Chọn **staging** riêng; KHÔNG thử Rules thay thế ngay trên Firestore đang hoạt động.
- Xuất/backup toàn bộ Firestore của game (bao gồm `users/{uid}`, `inventory`, mission, attendance, events, các collection khác); sao lưu chính xác bản Firestore Rules cũ và deployment config; ghi lại snapshot/time để khôi phục.
- Xác định có ứng dụng khác dùng chung Firebase project không: file `security/firestore.rules` mặc định deny ngoài `users/`. Nếu **có**, merge Rules theo đúng cấu trúc cũ, review trên Emulator. Không overwrite.
- Điều tra dữ liệu legacy về số dư/đồ đã được client tự ghi ở Phase 0; dữ liệu đã bị gian lận trước đây sẽ không tự phát hiện khi migrate.
- Kiểm kê client Phase 0 đang hoạt động; cần kế hoạch khóa phiên bản cũ/maintenance cutover vì Rules mới làm client cũ không thể ghi cloud.
- `server/` và `client/` bắt buộc deploy cùng cấu trúc thư mục; server đọc catalog/schema từ `client/src`.

## 2. Thứ tự triển khai staging

1. Tạo project staging Firebase Auth + Firestore tương ứng, cấu hình OAuth/domain cho client staging.
2. Cấp Application Default Credentials hoặc workload identity cho Node backend. Chỉ backend có Admin SDK; key không bao giờ xuất hiện trong client repo.
3. Cài `npm ci` tại client/server, chạy `npm run check:phase1`, `npm test`, `npm run build` và kiểm thử backend `/health` trả `apiReady:true`.
4. Cấu hình CORS `GAME_ALLOWED_ORIGINS` chính xác domain frontend và native origin. Native bắt buộc cấu hình `VITE_GAME_API_URL` là HTTPS công khai.
5. Áp dụng `firestore.rules` **chỉ ở staging sau khi xem xét Rules khác**; kiểm thử Emulator: chủ tài khoản đọc được profile, user khác không đọc được, mọi client `set/update/delete` users và `operations` bị từ chối, backend Admin giao dịch được.
6. Kiểm thử chéo thực tế (ít nhất hai tài khoản): đăng nhập, logout, sign-in phiên khác, xem xu/gems, vào ải, thắng/thua, phó bản trừ energy, claim thưởng, reload, làm nhiệm vụ, điểm danh và reset tuần, bán/khóa/nâng cấp/trang bị, gacha bằng coins/gems, thử requestId lặp.
7. Giả lập mất mạng sau khi server hoàn tất lệnh nhưng trước khi client nhận phản hồi; xác nhận retry dùng cùng requestId không tiêu hao lần hai. Test race giữa 2 tab/thiết bị và phiên hết hạn.
8. Thu kết quả test và chụp snapshot trước/sau các user thử nghiệm. Đảm bảo quy trình xóa tài khoản có xác thực gần đây, theo dõi xóa Auth/Firestore.

## 3. Triển khai production sau UAT

1. Backup DB và Rules và xác nhận chính xác Firebase project ID mục tiêu. Có maintenance window hoặc cơ chế ngừng client cũ.
2. Deploy/backend mới trước, xác nhận uptime/health/TLS/CORS; server `GAME_API_ENABLED=true`.
3. Đưa client Phase 1 vào phát hành đồng bộ; không cho client Phase 0 tiếp tục sửa profile cloud.
4. Thay Rules trong cùng cutover đã tính trước. Theo dõi sign-in, thất bại API, giao dịch, số dư, timeout, crash trong thời gian giám sát.
5. Chặn phát hành nếu chưa đạt kiểm thử commerce, anti-cheat, asset/config/native. **Bản này vẫn là UAT code, chưa đủ điều kiện commercial release.**

## 4. Rollback an toàn

- **Chưa áp dụng Rules/DB:** hoàn nguyên source bằng FULL SOURCE Phase 0 hoặc PATCH backup, khởi động lại service cũ. Không ảnh hưởng DB.
- **Đã áp dụng Rules:** không chỉ hoàn nguyên client Phase 0: client cũ sẽ không thể ghi vì Rules mới deny writes. Nếu buộc phải rollback app cũ, cần đánh giá lại rủi ro bảo mật và restore Rules cũ từ bản sao tại thời điểm triển khai **trong maintenance window**; điều này mở lại lỗ hổng cũ, nên ưu tiên tắt chức năng cloud/maintenance tới khi sửa xong.
- **Đã có giao dịch Phase 1:** không thay toàn bộ Firestore bằng snapshot cũ nếu chưa sao lưu và đối chiếu các giao dịch mới; bảo tồn `users/{uid}/operations/{requestId}` để tránh cấp/trừ thưởng hai lần.
- Không xóa/tái tạo sổ cái giao dịch khi rollback; không đổi UID người chơi.

## 5. Firebase Rules CLI (chỉ staging)

```powershell
# Chạy tại root nơi có firebase.json
firebase deploy --only firestore:rules --project YOUR_STAGING_PROJECT_ID
```

**Không bỏ `--project`, không chép service account vào frontend, không triển khai với production account mặc định.**
