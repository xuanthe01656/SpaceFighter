# Space Fighter Phase 1 V1.1.0 — Bản vá tương thích Windows ESM H1

## 1. Nguyên nhân

Chạy `npm test` trên Windows báo `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'c:'` ở 17 bài kiểm thử kinh tế. Ba bài kiểm thử Express vẫn đạt. Nguyên nhân là các lệnh `import()` đang nhận đường dẫn tuyệt đối Windows (`C:\...`) thay vì URL hợp lệ (`file:///C:/...`).

## 2. Các file được sửa

- `server/tests/economy.test.cjs`: bổ sung `pathToFileURL` từ `node:url`; chuyển `profilePath` và `configPath` sang URL trước khi import. Thêm kiểm thử khởi tạo `gameService` bằng module thật (không truyền sẵn mock catalog/schema).
- `server/lib/gameService.cjs`: cũng chuyển hai lần import catalog và schema sang file URL để **backend thực tế** tương thích Windows khi bật `GAME_API_ENABLED=true`.

**Không sửa gameplay, vật phẩm, tiền tệ, API contract, Firestore Rules hoặc dữ liệu tài khoản.**

## 3. Cách cập nhật trên Windows

1. Sao lưu hai file hiện tại: `server/lib/gameService.cjs` và `server/tests/economy.test.cjs`.
2. Giải nén `SpaceFighter_Phase1_V1_1_0_WINDOWS_ESM_HOTFIX_PATCH_ONLY.zip` vào thư mục gốc `SpaceFighter`, tức thư mục chứa `client` và `server`, cho phép ghi đè hai file được sửa. **Không** giải nén vào riêng thư mục `server`.
3. Mở PowerShell hoặc CMD và chạy:

```powershell
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
npm test
```

Kỳ vọng sau khi cài đủ Express: `tests 21`, `pass 21`, `fail 0`, `skipped 0`. Nếu chưa cài Express, ba test Express có thể `SKIP`. Khi đó chạy `npm ci` trong thư mục `server` rồi thử lại.

## 4. Kết quả kiểm chứng của bản vá

- Môi trường: Node.js v22.16.0 trên Linux.
- `npm test`: **21 tổng / 18 PASS / 0 FAIL / 3 SKIP**. Ba bài bị bỏ qua do môi trường phân tích không có dependency Express.
- 18 bài đạt gồm toàn bộ bài kiểm thử kinh tế hiện hữu và một bài kiểm thử bổ sung cho luồng bootstrap production.
- `node --check` cho cả hai file: PASS.
- Hai ZIP bàn giao đã được kiểm tra tính toàn vẹn CRC, đối chiếu SHA-256 từng file sửa với baseline Phase 1 V1.1.0.
- Chưa chạy thực tế trên Windows hoặc kết nối Firebase thật. Bạn cần chạy `npm test` trên máy để xác nhận.

## 5. Lưu ý và rollback

Cảnh báo `npm warn Unknown env config "min-release-age"` không liên quan đến lỗi ESM trên Windows, và không làm test thất bại.

Hotfix này không triển khai Firestore Rules, không mở lại thanh toán IAP và không thay đổi các giới hạn chống gian lận của Phase 1.

Để rollback, phục hồi đúng hai file từ FULL SOURCE Phase 1 V1.1.0 cũ. **Không cần migration cơ sở dữ liệu.**
