# Space Fighter Phase 1 V1.1.0 — Attendance Timezone Hotfix H2

## Lỗi đã xác nhận

Trên máy Windows có múi giờ UTC+7, sau Windows ESM Hotfix H1, `npm test` đạt **20/21**. Bài `Legacy attendance date preserves daily streak when moving to UTC server` thất bại với `actual: 1`, `expected: 12`.

## Nguyên nhân gốc

`server/lib/economy.cjs` dùng `Date.parse(a.lastDate)` với dữ liệu legacy `lastDate` do `Date.prototype.toDateString()` sinh ra, chẳng hạn `Sun Oct 11 2026`. Chuỗi này không có timezone; Node diễn giải theo timezone của máy chủ. Tại UTC+7, `Sun Oct 11 2026 00:00` trở thành `2026-10-10 17:00Z`, tức ngày UTC trước đó, làm chuỗi điểm danh bị reset.

## Cách sửa

- `server/lib/economy.cjs`: thêm bộ đọc ngày lịch `legacyCalendarDay()` chỉ nhận đúng định dạng ngày lịch legacy (weekday, month, day, year). Dùng `Date.UTC(...)`, kiểm tra tính hợp lệ và weekday, từ đó tính chênh lệch ngày **không phụ thuộc timezone**. Dữ liệu `lastClaimUTC` chuẩn mới vẫn được ưu tiên; dữ liệu invalid không được tự diễn giải.
- `server/tests/economy.test.cjs`: bổ sung 2 bài hồi quy: (1) chạy lệnh điểm danh thực trong các subprocess đặt timezone UTC, Asia/Ho_Chi_Minh, Pacific/Kiritimati và America/Los_Angeles, (2) không công nhận ngày sai định dạng/lịch.
- Không thay đổi API contract, Firestore Rules, cấu hình Firebase, thanh toán, logic chiến đấu, gacha, trang bị hoặc công thức thưởng.

## Phạm vi tương thích

**Bản nền bắt buộc:** Phase 1 V1.1.0 **đã áp Windows ESM Hotfix H1**. Chỉ cần chép đè hai file trong PATCH ONLY vào thư mục `SpaceFighter` (thư mục chứa `client` và `server`). Nếu bạn chọn FULL SOURCE H2, không cần áp H1/H2 riêng.

## Lệnh kiểm chứng trên máy Windows

```powershell
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
npm test
```

Kỳ vọng có cài đủ Express và các package phụ thuộc: **tests 23, pass 23, fail 0, skipped 0**. Ba bài test Express đã đạt ở máy bạn trước đây; môi trường kiểm thử này thiếu Express, nên các bài đó SKIP.

## Kết quả kiểm thử bản vá

- `node --check` cả hai file: PASS.
- Node.js 22/Linux: `npm test` với `TZ=UTC`, `TZ=Asia/Ho_Chi_Minh`, `TZ=America/Los_Angeles`: **23 tổng, 20 PASS, 0 FAIL, 3 SKIP** ở mỗi múi giờ.
- Chạy riêng `tests/economy.test.cjs` với `TZ=Asia/Ho_Chi_Minh`: **20 PASS / 0 FAIL**.
- ZIP: kiểm tra CRC và byte nội dung từng file vá.
- Chưa xác minh thực tế với Firestore production hoặc môi trường Windows ở lượt này; cần chạy lại trên máy của bạn.

## Lưu ý và rollback

- **Không cần migration database, không cần chỉnh sửa Firestore Rules, không cần `npm ci` nếu dependency đã cài và không đổi.**
- `npm warn Unknown env config "min-release-age"` không gây lỗi kiểm thử; không bắt buộc sửa ở hotfix này.
- Để rollback riêng H2, phục hồi `server/lib/economy.cjs` và `server/tests/economy.test.cjs` từ **Windows ESM Hotfix H1** (không sử dụng bản Phase 1 trước H1, vì sẽ mang lỗi đường dẫn Windows quay lại).
- Không triển khai các Security Rules hạn chế Phase 1 khi còn client Phase 0 ghi dữ liệu trực tiếp; việc cutover phải có kiểm thử staging và sao lưu.
